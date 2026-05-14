/* SPDX-License-Identifier: AGPL-3.0-only */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const describeNamespaceMock = vi.fn();
const connectionMock = {
  workflowService: {
    describeNamespace: describeNamespaceMock,
  },
};
const connectMock = vi.fn();

vi.mock('@temporalio/client', () => ({
  Connection: {
    connect: connectMock,
  },
  Client: vi.fn().mockImplementation(function ClientMock(this: {
    connection: unknown;
    workflow: { start: ReturnType<typeof vi.fn>; getHandle: ReturnType<typeof vi.fn> };
  }, { connection }: { connection: unknown }) {
    this.connection = connection;
    this.workflow = {
      start: vi.fn().mockResolvedValue({ workflowId: 'mock-workflow' }),
      getHandle: vi.fn().mockReturnValue({
        signal: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue({ phase: 'active', majorIncidentId: '' }),
      }),
    };
  }),
  WorkflowExecutionAlreadyStartedError: class extends Error {},
}));

vi.mock('../config', () => ({
  config: {
    temporal: {
      address: 'temporal:7233',
      namespace: 'default',
      taskQueue: 'nova-task-queue',
    },
  },
}));

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('checkTemporalHealth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    connectMock.mockResolvedValue(connectionMock);
    describeNamespaceMock.mockReset();
  });

  it('reports healthy only when namespace probe succeeds', async () => {
    describeNamespaceMock.mockResolvedValueOnce({});
    const { checkTemporalHealth } = await import('./workflows');

    await expect(checkTemporalHealth()).resolves.toBe(true);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(describeNamespaceMock).toHaveBeenCalledWith({ namespace: 'default' });
  });

  it('reports disconnected after a probe failure and recovers on a fresh reconnect', async () => {
    describeNamespaceMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('temporal down'))
      .mockResolvedValueOnce({});

    const { checkTemporalHealth } = await import('./workflows');

    await expect(checkTemporalHealth()).resolves.toBe(true);
    await expect(checkTemporalHealth()).resolves.toBe(false);
    await expect(checkTemporalHealth()).resolves.toBe(true);

    // First call connects, second uses cached client, third reconnects after failure reset.
    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(describeNamespaceMock).toHaveBeenCalledTimes(3);
  });
});

describe('Major incident Temporal client helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    connectMock.mockResolvedValue(connectionMock);
    describeNamespaceMock.mockReset();
    describeNamespaceMock.mockResolvedValue({});
  });

  it('startMajorIncidentWorkflow calls workflow.start with majorIncidentWorkflow type', async () => {
    const { startMajorIncidentWorkflow } = await import('./workflows');
    await startMajorIncidentWorkflow({
      majorIncidentId: '11111111-1111-1111-1111-111111111111',
      tenantId: '22222222-2222-2222-2222-222222222222',
      title: 'Test outage',
    });
    const { Client } = await import('@temporalio/client');
    const inst = (Client as unknown as { mock: { results: { value: { workflow: { start: ReturnType<typeof vi.fn> } } }[] } }).mock.results[0]?.value;
    expect(inst?.workflow.start).toHaveBeenCalledWith(
      'majorIncidentWorkflow',
      expect.objectContaining({
        workflowId: 'major-incident-11111111-1111-1111-1111-111111111111',
      }),
    );
  });

  it('signalMajorIncidentDeclareResolved signals declareResolved', async () => {
    const { signalMajorIncidentDeclareResolved } = await import('./workflows');
    await signalMajorIncidentDeclareResolved('11111111-1111-1111-1111-111111111111');
    const { Client } = await import('@temporalio/client');
    const Ctor = Client as unknown as { mock: { results: { value: { workflow: { getHandle: ReturnType<typeof vi.fn> } } }[] } };
    const inst = Ctor.mock.results[Ctor.mock.results.length - 1]?.value;
    expect(inst?.workflow.getHandle).toHaveBeenCalledWith('major-incident-11111111-1111-1111-1111-111111111111');
    const h = inst?.workflow.getHandle.mock.results[0]?.value as { signal: ReturnType<typeof vi.fn> };
    expect(h.signal).toHaveBeenCalledWith('declareResolved');
  });
});
