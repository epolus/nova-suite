/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { Connection, Client } from '@temporalio/client';
import { authenticate, requireRole } from '../../middleware/auth';
import { config } from '../../config';

const router = Router();

router.use(authenticate, requireRole('admin'));

// ─── Lazy Temporal client ───

let connection: Connection | null = null;
let client: Client | null = null;

async function getTemporal(): Promise<{ connection: Connection; client: Client }> {
  if (!connection) {
    connection = await Connection.connect({ address: config.temporal.address });
  }
  if (!client) {
    client = new Client({ connection, namespace: config.temporal.namespace });
  }
  return { connection, client };
}

// Temporal status enum to human-readable name
const STATUS_NAMES: Record<number, string> = {
  0: 'Unspecified',
  1: 'Running',
  2: 'Completed',
  3: 'Failed',
  4: 'Cancelled',
  5: 'Terminated',
  6: 'ContinuedAsNew',
  7: 'TimedOut',
};

function mapWorkflowInfo(info: {
  type?: string;
  workflowId: string;
  runId: string;
  taskQueue: string;
  status: { code: number; name: string };
  startTime: Date;
  executionTime?: Date;
  closeTime?: Date;
  historyLength: number;
  memo?: Record<string, unknown>;
}) {
  return {
    workflowId: info.workflowId,
    runId: info.runId,
    type: info.type || 'unknown',
    status: info.status.name,
    statusCode: info.status.code,
    taskQueue: info.taskQueue,
    startTime: info.startTime?.toISOString() ?? null,
    executionTime: info.executionTime?.toISOString() ?? null,
    closeTime: info.closeTime?.toISOString() ?? null,
    historyLength: info.historyLength,
    memo: info.memo ?? {},
  };
}

// ─── GET /api/temporal/overview ───
router.get('/overview', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { connection: conn, client: cl } = await getTemporal();
    const namespace = config.temporal.namespace;

    const nsInfo: Record<string, unknown> = await (conn.workflowService.describeNamespace({ namespace }) as unknown as Promise<Record<string, unknown>>);

    const [runningCount, failedCount, completedCount] = await Promise.all([
      cl.workflow.count('ExecutionStatus = "Running"').then((r) => r.count),
      cl.workflow.count('ExecutionStatus = "Failed" AND CloseTime > "' + oneDayAgo() + '"').then((r) => r.count),
      cl.workflow.count('ExecutionStatus = "Completed" AND CloseTime > "' + oneDayAgo() + '"').then((r) => r.count),
    ]);

    const nsConfig = nsInfo.config as { workflowExecutionRetentionTtl?: { seconds?: number | Long } } | undefined;
    const nsInfoDetails = nsInfo.namespaceInfo as { name?: string; state?: string } | undefined;
    const ttlSecondsRaw = nsConfig?.workflowExecutionRetentionTtl?.seconds;
    const ttlSeconds =
      ttlSecondsRaw !== undefined && ttlSecondsRaw !== null ? Number(ttlSecondsRaw as number) : null;
    const retentionDaysServer =
      ttlSeconds !== null && Number.isFinite(ttlSeconds) && ttlSeconds > 0
        ? ttlSeconds / 86400
        : null;
    const retentionDaysConfigured = config.temporal.retentionDays;
    /** Effective TTL on the Temporal namespace (authoritative for history retention). */
    const retentionDays = retentionDaysServer ?? retentionDaysConfigured;

    res.json({
      namespace: nsInfoDetails?.name ?? namespace,
      state: nsInfoDetails?.state ?? 'Unknown',
      retentionDays,
      retentionDaysServer,
      retentionDaysConfigured,
      running: runningCount,
      failedLast24h: failedCount,
      completedLast24h: completedCount,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/temporal/workflows ───
router.get('/workflows', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { client: cl } = await getTemporal();
    const status = req.query.status as string | undefined;
    const type = req.query.type as string | undefined;
    const search = req.query.search as string | undefined;
    const pageSize = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const pageToken = req.query.pageToken as string | undefined;

    const TEMPORAL_STATUS_MAP: Record<string, string> = {
      Running: 'Running',
      Completed: 'Completed',
      Failed: 'Failed',
      Cancelled: 'Canceled',
      Terminated: 'Terminated',
      TimedOut: 'TimedOut',
      ContinuedAsNew: 'ContinuedAsNew',
    };

    const queryParts: string[] = [];
    if (status && status !== 'all') {
      const mappedStatus = TEMPORAL_STATUS_MAP[status] || status;
      queryParts.push(`ExecutionStatus = "${mappedStatus}"`);
    }
    if (type) {
      queryParts.push(`WorkflowType = "${type}"`);
    }
    if (search) {
      queryParts.push(`WorkflowId = "${search}"`);
    }

    const query = queryParts.length > 0 ? queryParts.join(' AND ') : undefined;

    const response: Record<string, unknown> = await (cl.connection.workflowService.listWorkflowExecutions({
      namespace: config.temporal.namespace,
      query,
      pageSize,
      nextPageToken: pageToken ? Buffer.from(pageToken, 'base64') : undefined,
    }) as unknown as Promise<Record<string, unknown>>);

    const executions = (response.executions ?? []) as Array<Record<string, unknown>>;
    const workflows = executions.map((exec) => {
      const typeObj = exec.type as { name?: string } | undefined;
      const execObj = exec.execution as { workflowId?: string; runId?: string } | undefined;
      const wfType = typeObj?.name ?? 'unknown';
      const wfId = execObj?.workflowId ?? '';
      const runId = execObj?.runId ?? '';
      const tq = exec.taskQueue as string ?? '';
      const statusCode = (exec.status as number) ?? 0;
      const startMs = exec.startTime ? toMs(exec.startTime as { seconds?: number | Long | null; nanos?: number | null }) : null;
      const closeMs = exec.closeTime ? toMs(exec.closeTime as { seconds?: number | Long | null; nanos?: number | null }) : null;
      const execMs = exec.executionTime ? toMs(exec.executionTime as { seconds?: number | Long | null; nanos?: number | null }) : null;

      return {
        workflowId: wfId,
        runId,
        type: wfType,
        status: STATUS_NAMES[statusCode] ?? 'Unknown',
        statusCode,
        taskQueue: tq,
        startTime: startMs ? new Date(startMs).toISOString() : null,
        executionTime: execMs ? new Date(execMs).toISOString() : null,
        closeTime: closeMs ? new Date(closeMs).toISOString() : null,
        historyLength: exec.historyLength ? Number(exec.historyLength) : 0,
      };
    });

    const rawToken = response.nextPageToken as Uint8Array | undefined;
    const nextToken = rawToken && rawToken.length > 0
      ? Buffer.from(rawToken).toString('base64')
      : null;

    res.json({ workflows, nextPageToken: nextToken });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/temporal/workflows/:workflowId/:runId ───
router.get('/workflows/:workflowId/:runId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { client: cl } = await getTemporal();
    const handle = cl.workflow.getHandle(req.params.workflowId as string, req.params.runId as string);
    const desc = await handle.describe();

    res.json({
      ...mapWorkflowInfo(desc),
      searchAttributes: desc.searchAttributes ?? {},
      parentExecution: desc.parentExecution ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/temporal/workflows/:workflowId/:runId/history ───
router.get('/workflows/:workflowId/:runId/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { connection: conn } = await getTemporal();
    const pageSize = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const pageToken = req.query.pageToken as string | undefined;

    const response: Record<string, unknown> = await (conn.workflowService.getWorkflowExecutionHistory({
      namespace: config.temporal.namespace,
      execution: {
        workflowId: req.params.workflowId as string,
        runId: req.params.runId as string,
      },
      maximumPageSize: pageSize,
      nextPageToken: pageToken ? Buffer.from(pageToken, 'base64') : undefined,
    }) as unknown as Promise<Record<string, unknown>>);

    const history = response.history as { events?: Array<Record<string, unknown>> } | undefined;
    const rawEvents = history?.events ?? [];
    const events = rawEvents.map((evt: Record<string, unknown>) => {
      const eventType = (evt.eventType as number) ?? 0;
      const eventTime = evt.eventTime ? toMs(evt.eventTime as { seconds?: number | Long | null; nanos?: number | null }) : null;

      const attrKeys = Object.keys(evt).filter(
        (k) => k.endsWith('EventAttributes') && evt[k] != null,
      );
      const attributes = attrKeys.length > 0 ? evt[attrKeys[0]] : null;

      return {
        eventId: evt.eventId ? Number(evt.eventId) : 0,
        eventType: EVENT_TYPE_NAMES[eventType] ?? `Unknown(${eventType})`,
        eventTypeCode: eventType,
        timestamp: eventTime ? new Date(eventTime).toISOString() : null,
        attributes: attributes ? sanitizeAttributes(attributes) : null,
      };
    });

    const rawToken = response.nextPageToken as Uint8Array | undefined;
    const nextPageTokenStr = rawToken && rawToken.length > 0
      ? Buffer.from(rawToken).toString('base64')
      : null;

    res.json({ events, nextPageToken: nextPageTokenStr });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/temporal/workflows/:workflowId/:runId/terminate ───
router.post('/workflows/:workflowId/:runId/terminate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { client: cl } = await getTemporal();
    const handle = cl.workflow.getHandle(req.params.workflowId as string, req.params.runId as string);
    await handle.terminate(req.body?.reason || 'Terminated via Nova admin');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/temporal/workflows/:workflowId/:runId/cancel ───
router.post('/workflows/:workflowId/:runId/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { client: cl } = await getTemporal();
    const handle = cl.workflow.getHandle(req.params.workflowId as string, req.params.runId as string);
    await handle.cancel();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Helpers ───

function oneDayAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString();
}

function toMs(ts: { seconds?: number | Long | null; nanos?: number | null }): number {
  const seconds = typeof ts.seconds === 'number' ? ts.seconds : Number(ts.seconds ?? 0);
  return seconds * 1000 + Math.floor((ts.nanos ?? 0) / 1_000_000);
}

type Long = { toNumber(): number };

function sanitizeAttributes(obj: unknown): unknown {
  if (obj === null || obj === undefined) return null;
  if (obj instanceof Uint8Array) return `<${obj.length} bytes>`;
  if (typeof obj === 'bigint') return obj.toString();
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeAttributes);
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (val === null || val === undefined) continue;
    if (val instanceof Uint8Array) {
      result[key] = `<${val.length} bytes>`;
    } else if (typeof val === 'bigint') {
      result[key] = val.toString();
    } else if (typeof val === 'object' && val !== null && 'low' in val && 'high' in val) {
      result[key] = Number((val as { low: number; high: number }).low);
    } else if (typeof val === 'object') {
      result[key] = sanitizeAttributes(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

const EVENT_TYPE_NAMES: Record<number, string> = {
  0: 'Unspecified',
  1: 'WorkflowExecutionStarted',
  2: 'WorkflowExecutionCompleted',
  3: 'WorkflowExecutionFailed',
  4: 'WorkflowExecutionTimedOut',
  5: 'WorkflowTaskScheduled',
  6: 'WorkflowTaskStarted',
  7: 'WorkflowTaskCompleted',
  8: 'WorkflowTaskTimedOut',
  9: 'WorkflowTaskFailed',
  10: 'ActivityTaskScheduled',
  11: 'ActivityTaskStarted',
  12: 'ActivityTaskCompleted',
  13: 'ActivityTaskFailed',
  14: 'ActivityTaskTimedOut',
  15: 'ActivityTaskCancelRequested',
  16: 'ActivityTaskCancelled',
  17: 'TimerStarted',
  18: 'TimerFired',
  19: 'TimerCancelled',
  20: 'WorkflowExecutionCancelRequested',
  21: 'WorkflowExecutionCancelled',
  22: 'RequestCancelExternalWorkflowExecutionInitiated',
  23: 'RequestCancelExternalWorkflowExecutionFailed',
  24: 'ExternalWorkflowExecutionCancelRequested',
  25: 'MarkerRecorded',
  26: 'WorkflowExecutionSignaled',
  27: 'WorkflowExecutionTerminated',
  28: 'WorkflowExecutionContinuedAsNew',
  29: 'StartChildWorkflowExecutionInitiated',
  30: 'StartChildWorkflowExecutionFailed',
  31: 'ChildWorkflowExecutionStarted',
  32: 'ChildWorkflowExecutionCompleted',
  33: 'ChildWorkflowExecutionFailed',
  34: 'ChildWorkflowExecutionCancelled',
  35: 'ChildWorkflowExecutionTimedOut',
  36: 'ChildWorkflowExecutionTerminated',
  37: 'SignalExternalWorkflowExecutionInitiated',
  38: 'SignalExternalWorkflowExecutionFailed',
  39: 'ExternalWorkflowExecutionSignaled',
  40: 'UpsertWorkflowSearchAttributes',
};

export default router;
