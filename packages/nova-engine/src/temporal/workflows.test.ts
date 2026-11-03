/* SPDX-License-Identifier: AGPL-3.0-only */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const describeNamespaceMock = vi.fn();
const connectionMock = {
  workflowService: {
    describeNamespace: describeNamespaceMock,
  },
};
const connectMock = vi.fn();
const scheduleCreateMock = vi.fn();
const scheduleUpdateMock = vi.fn();
const scheduleDeleteMock = vi.fn();
const workflowTerminateMock = vi.fn();

vi.mock('@temporalio/client', () => ({
  Connection: {
    connect: connectMock,
  },
  Client: vi.fn().mockImplementation(function ClientMock(this: {
    connection: unknown;
    workflow: { start: ReturnType<typeof vi.fn>; getHandle: ReturnType<typeof vi.fn> };
    schedule: { create: ReturnType<typeof vi.fn>; getHandle: ReturnType<typeof vi.fn> };
  }, { connection }: { connection: unknown }) {
    this.connection = connection;
    this.workflow = {
      start: vi.fn().mockResolvedValue({ workflowId: 'mock-workflow' }),
      getHandle: vi.fn().mockReturnValue({
        signal: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue({ phase: 'active', majorIncidentId: '' }),
        terminate: workflowTerminateMock,
      }),
    };
    this.schedule = {
      create: scheduleCreateMock,
      getHandle: vi.fn().mockReturnValue({
        update: scheduleUpdateMock,
        delete: scheduleDeleteMock,
      }),
    };
  }),
  WorkflowExecutionAlreadyStartedError: class extends Error {},
  ScheduleAlreadyRunning: class ScheduleAlreadyRunning extends Error {
    constructor(message: string, public readonly scheduleId: string) {
      super(message);
    }
  },
  ScheduleNotFoundError: class ScheduleNotFoundError extends Error {
    constructor(message: string, public readonly scheduleId: string) {
      super(message);
    }
  },
  ScheduleOverlapPolicy: {
    SKIP: 'SKIP',
  },
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
    scheduleCreateMock.mockResolvedValue(undefined);
    scheduleUpdateMock.mockResolvedValue(undefined);
    scheduleDeleteMock.mockResolvedValue(undefined);
    workflowTerminateMock.mockResolvedValue(undefined);
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
    scheduleCreateMock.mockResolvedValue(undefined);
    scheduleUpdateMock.mockResolvedValue(undefined);
    scheduleDeleteMock.mockResolvedValue(undefined);
    workflowTerminateMock.mockResolvedValue(undefined);
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

describe('data source schedules', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    connectMock.mockResolvedValue(connectionMock);
    describeNamespaceMock.mockReset();
    describeNamespaceMock.mockResolvedValue({});
    scheduleCreateMock.mockResolvedValue(undefined);
    scheduleUpdateMock.mockResolvedValue(undefined);
    scheduleDeleteMock.mockResolvedValue(undefined);
    workflowTerminateMock.mockResolvedValue(undefined);
  });

  it('registers a Temporal Schedule instead of a cron workflow', async () => {
    const { startDataSourceSync } = await import('./workflows');
    const scheduleId = await startDataSourceSync({
      dataSourceId: 'ds-1',
      tenantId: 'tenant-1',
      cronSchedule: '0 2 * * *',
    });

    expect(scheduleId).toBe('datasource-schedule-ds-1');
    expect(workflowTerminateMock).toHaveBeenCalledWith('Replaced by data source Schedule');
    expect(scheduleCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      scheduleId: 'datasource-schedule-ds-1',
      spec: { cronExpressions: ['0 2 * * *'] },
      action: expect.objectContaining({
        type: 'startWorkflow',
        workflowType: 'dataSourceSync',
        workflowExecutionTimeout: '2 hours',
        args: [{
          dataSourceId: 'ds-1',
          tenantId: 'tenant-1',
          triggerType: 'scheduled',
        }],
      }),
      policies: expect.objectContaining({
        overlap: 'SKIP',
        pauseOnFailure: false,
      }),
    }));

    const { Client } = await import('@temporalio/client');
    const inst = (Client as unknown as {
      mock: { results: { value: { workflow: { start: ReturnType<typeof vi.fn> } } }[] };
    }).mock.results[0]?.value;
    expect(inst?.workflow.start).not.toHaveBeenCalled();
  });

  it('updates the cron expression when the schedule already exists', async () => {
    const { ScheduleAlreadyRunning } = await import('@temporalio/client');
    scheduleCreateMock.mockRejectedValueOnce(new ScheduleAlreadyRunning('exists', 'datasource-schedule-ds-1'));
    const { startDataSourceSync } = await import('./workflows');

    await startDataSourceSync({
      dataSourceId: 'ds-1',
      tenantId: 'tenant-1',
      cronSchedule: '0 */6 * * *',
    });

    expect(scheduleUpdateMock).toHaveBeenCalledTimes(1);
    const updater = scheduleUpdateMock.mock.calls[0][0] as (previous: {
      policies: { overlap: string; catchupWindow: number; pauseOnFailure: boolean };
    }) => { spec: { cronExpressions: string[] }; state: { paused: boolean } };
    const updated = updater({
      policies: { overlap: 'SKIP', catchupWindow: 60_000, pauseOnFailure: true },
    });
    expect(updated.spec.cronExpressions).toEqual(['0 */6 * * *']);
    expect(updated.state.paused).toBe(false);
    expect(updated.policies).toEqual(expect.objectContaining({ pauseOnFailure: false }));
  });

  it('starts a one-shot manual run without a cron schedule', async () => {
    const { startDataSourceSync } = await import('./workflows');
    await startDataSourceSync({
      dataSourceId: 'ds-1',
      tenantId: 'tenant-1',
      immediate: true,
    });

    const { Client } = await import('@temporalio/client');
    const inst = (Client as unknown as {
      mock: { results: { value: { workflow: { start: ReturnType<typeof vi.fn> } } }[] };
    }).mock.results[0]?.value;
    expect(inst?.workflow.start).toHaveBeenCalledWith(
      'dataSourceSync',
      expect.objectContaining({
        workflowExecutionTimeout: '2 hours',
        args: [expect.objectContaining({ triggerType: 'manual' })],
      }),
    );
    const options = inst?.workflow.start.mock.calls[0][1] as { cronSchedule?: string };
    expect(options.cronSchedule).toBeUndefined();
    expect(scheduleCreateMock).not.toHaveBeenCalled();
  });

  it('deletes the Temporal Schedule when a data source schedule is disabled', async () => {
    const { cancelDataSourceSchedule } = await import('./workflows');
    await cancelDataSourceSchedule('ds-1');
    expect(scheduleDeleteMock).toHaveBeenCalledTimes(1);
    expect(workflowTerminateMock).toHaveBeenCalledWith('Replaced by data source Schedule');
  });
});
