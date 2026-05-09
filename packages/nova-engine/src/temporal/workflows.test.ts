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
  Client: vi.fn().mockImplementation(function ClientMock(this: { connection: unknown }, { connection }: { connection: unknown }) {
    this.connection = connection;
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
