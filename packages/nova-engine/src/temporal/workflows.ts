/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  Connection,
  Client,
  ScheduleAlreadyRunning,
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
  WorkflowExecutionAlreadyStartedError,
} from '@temporalio/client';
import { config } from '../config';
import { logger } from '../logger';

const TASK_QUEUE = config.temporal.taskQueue;

let connection: Connection | null = null;
let client: Client | null = null;

function resetTemporalClientCache(): void {
  connection = null;
  client = null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Temporal health check timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getClient(): Promise<Client> {
  if (!client) {
    connection = await Connection.connect({ address: config.temporal.address });
    client = new Client({ connection, namespace: config.temporal.namespace });
  }
  return client;
}

export async function checkTemporalHealth(timeoutMs = 2000): Promise<boolean> {
  try {
    const cl = await getClient();
    await withTimeout(
      cl.connection.workflowService.describeNamespace({ namespace: config.temporal.namespace }),
      timeoutMs,
    );
    return true;
  } catch {
    resetTemporalClientCache();
    return false;
  }
}

export async function startIncidentEscalation(params: {
  incidentId: string;
  tenantId: string;
  priority: number;
  slaDueAt: string;
  responseDueAt?: string | null;
}): Promise<string> {
  const workflowId = `incident-escalation-${params.incidentId}`;
  try {
    const cl = await getClient();
    const handle = await cl.workflow.start('incidentEscalation', {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [params],
      workflowExecutionTimeout: '7 days',
    });
    logger.info({ workflowId: handle.workflowId, incidentId: params.incidentId }, 'Started escalation workflow');
    return handle.workflowId;
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info({ workflowId, incidentId: params.incidentId }, 'Incident escalation workflow already running');
      return workflowId;
    }
    logger.error({ err, incidentId: params.incidentId }, 'Failed to start escalation workflow');
    throw err;
  }
}

export async function startCatalogFulfillment(params: {
  requestId: string;
  tenantId: string;
  serviceItemId: string;
}): Promise<string> {
  const workflowId = `catalog-fulfillment-${params.requestId}`;
  try {
    const cl = await getClient();
    const handle = await cl.workflow.start('catalogFulfillment', {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [params],
      workflowExecutionTimeout: '30 days',
    });
    logger.info({ workflowId: handle.workflowId, requestId: params.requestId }, 'Started catalog fulfillment workflow');
    return handle.workflowId;
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info({ workflowId, requestId: params.requestId }, 'Catalog fulfillment workflow already running');
      return workflowId;
    }
    logger.error({ err, requestId: params.requestId }, 'Failed to start catalog fulfillment workflow');
    throw err;
  }
}

export async function startServiceNowMigration(params: {
  runId: string;
  tenantId: string;
}): Promise<string> {
  const workflowId = `servicenow-migration-${params.runId}`;
  try {
    const cl = await getClient();
    const handle = await cl.workflow.start('serviceNowCatalogMigration', {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [params],
      workflowExecutionTimeout: '6 hours',
    });
    logger.info({ workflowId: handle.workflowId, runId: params.runId }, 'Started ServiceNow migration workflow');
    return handle.workflowId;
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) return workflowId;
    logger.error({ err, runId: params.runId }, 'Failed to start ServiceNow migration workflow');
    throw err;
  }
}

export async function signalTaskCompleted(
  requestId: string,
  taskId: string,
  outcome: string,
  notes: string | null,
  userId: string,
): Promise<void> {
  try {
    const cl = await getClient();
    const handle = cl.workflow.getHandle(`catalog-fulfillment-${requestId}`);
    await handle.signal('taskCompleted', { taskId, outcome, notes, userId });
    logger.info({ requestId, taskId, outcome }, 'Sent taskCompleted signal');
  } catch (err) {
    logger.warn({ err, requestId, taskId }, 'Could not signal catalog fulfillment workflow');
    throw err;
  }
}

const DATA_SOURCE_RUN_TIMEOUT = '2 hours' as const;

export function dataSourceScheduleId(dataSourceId: string): string {
  return `datasource-schedule-${dataSourceId}`;
}

function dataSourceScheduleAction(params: { dataSourceId: string; tenantId: string }) {
  return {
    type: 'startWorkflow' as const,
    workflowType: 'dataSourceSync',
    taskQueue: TASK_QUEUE,
    workflowId: `datasource-scheduled-${params.dataSourceId}`,
    args: [{
      dataSourceId: params.dataSourceId,
      tenantId: params.tenantId,
      triggerType: 'scheduled' as const,
    }],
    // Each scheduled run is its own workflow. This timeout bounds that run,
    // not the lifetime of the schedule.
    workflowExecutionTimeout: DATA_SOURCE_RUN_TIMEOUT,
    workflowRunTimeout: DATA_SOURCE_RUN_TIMEOUT,
  };
}

async function terminateLegacyDataSourceCron(cl: Client, dataSourceId: string): Promise<void> {
  // Older builds registered a cron workflow under this id. Cron cancel only
  // stops the current run, and a short execution timeout closed the chain
  // before the next tick. Terminate so a Schedule is the only timer left.
  try {
    const handle = cl.workflow.getHandle(dataSourceScheduleId(dataSourceId));
    await handle.terminate('Replaced by data source Schedule');
  } catch {
    // No legacy cron workflow is open.
  }
}

async function ensureDataSourceSchedule(params: {
  dataSourceId: string;
  tenantId: string;
  cronSchedule?: string;
}): Promise<string> {
  const cronSchedule = params.cronSchedule?.trim() || '0 2 * * *';
  const scheduleId = dataSourceScheduleId(params.dataSourceId);
  const cl = await getClient();
  await terminateLegacyDataSourceCron(cl, params.dataSourceId);

  const action = dataSourceScheduleAction(params);
  const policies = {
    overlap: ScheduleOverlapPolicy.SKIP,
    catchupWindow: '1 day' as const,
    pauseOnFailure: false,
  };

  try {
    await cl.schedule.create({
      scheduleId,
      spec: { cronExpressions: [cronSchedule] },
      action,
      policies,
    });
    logger.info({ scheduleId, dataSourceId: params.dataSourceId, cronSchedule }, 'Created data source schedule');
  } catch (err) {
    if (!(err instanceof ScheduleAlreadyRunning)) throw err;
    const handle = cl.schedule.getHandle(scheduleId);
    await handle.update((previous) => ({
      spec: { cronExpressions: [cronSchedule] },
      action,
      policies: {
        ...previous.policies,
        ...policies,
      },
      state: {
        paused: false,
        note: 'Data source sync schedule',
      },
    }));
    logger.info({ scheduleId, dataSourceId: params.dataSourceId, cronSchedule }, 'Updated data source schedule');
  }

  return scheduleId;
}

export async function startDataSourceSync(params: {
  dataSourceId: string;
  tenantId: string;
  cronSchedule?: string;
  immediate?: boolean;
}): Promise<string> {
  if (!params.immediate) {
    try {
      return await ensureDataSourceSchedule(params);
    } catch (err) {
      logger.error({ err, dataSourceId: params.dataSourceId }, 'Failed to start data source schedule');
      throw err;
    }
  }

  const workflowId = `datasource-run-${params.dataSourceId}-${Date.now()}`;
  try {
    const cl = await getClient();
    const handle = await cl.workflow.start('dataSourceSync', {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [{
        dataSourceId: params.dataSourceId,
        tenantId: params.tenantId,
        triggerType: 'manual',
      }],
      workflowExecutionTimeout: DATA_SOURCE_RUN_TIMEOUT,
    });
    logger.info({ workflowId: handle.workflowId, dataSourceId: params.dataSourceId }, 'Started data source sync workflow');
    return handle.workflowId;
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info({ workflowId, dataSourceId: params.dataSourceId }, 'Data source sync workflow already running');
      return workflowId;
    }
    logger.error({ err, dataSourceId: params.dataSourceId }, 'Failed to start data source sync workflow');
    throw err;
  }
}

export async function cancelDataSourceSchedule(dataSourceId: string): Promise<void> {
  const scheduleId = dataSourceScheduleId(dataSourceId);
  try {
    const cl = await getClient();
    try {
      await cl.schedule.getHandle(scheduleId).delete();
      logger.info({ dataSourceId, scheduleId }, 'Deleted data source schedule');
    } catch (err) {
      if (!(err instanceof ScheduleNotFoundError)) {
        logger.warn({ err, dataSourceId, scheduleId }, 'Could not delete data source schedule');
      }
    }
    await terminateLegacyDataSourceCron(cl, dataSourceId);
  } catch (err) {
    logger.warn({ err, dataSourceId }, 'Could not cancel data source schedule (may not exist)');
  }
}

export async function signalIncidentResolved(incidentId: string): Promise<void> {
  try {
    const cl = await getClient();
    const handle = cl.workflow.getHandle(`incident-escalation-${incidentId}`);
    await handle.signal('incidentResolved');
    logger.info({ incidentId }, 'Sent resolved signal to escalation workflow');
  } catch (err) {
    // Workflow may have already completed — don't fail the HTTP request
    logger.warn({ err, incidentId }, 'Could not signal escalation workflow (may have already completed)');
  }
}

export async function startIncidentAutoClose(params: {
  incidentId: string;
  tenantId: string;
  autoCloseAfterDays?: number;
}): Promise<string> {
  const workflowId = `incident-autoclose-${params.incidentId}`;
  const autoCloseAfterDays = params.autoCloseAfterDays ?? 7;
  try {
    const cl = await getClient();
    const handle = await cl.workflow.start('incidentAutoClose', {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [{
        incidentId: params.incidentId,
        tenantId: params.tenantId,
        autoCloseAfterDays,
      }],
      workflowExecutionTimeout: `${autoCloseAfterDays + 1} days`,
    });
    logger.info({ workflowId: handle.workflowId, incidentId: params.incidentId }, 'Started incident auto-close workflow');
    return handle.workflowId;
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info({ workflowId, incidentId: params.incidentId }, 'Incident auto-close workflow already running');
      return workflowId;
    }
    logger.error({ err, incidentId: params.incidentId }, 'Failed to start incident auto-close workflow');
    throw err;
  }
}

export async function cancelIncidentAutoClose(incidentId: string): Promise<void> {
  try {
    const cl = await getClient();
    const handle = cl.workflow.getHandle(`incident-autoclose-${incidentId}`);
    await handle.cancel();
    logger.info({ incidentId }, 'Cancelled incident auto-close workflow');
  } catch (err) {
    // Workflow may not exist/already completed — ignore to keep API path resilient
    logger.warn({ err, incidentId }, 'Could not cancel incident auto-close workflow');
  }
}

export async function startKnowledgeApproval(params: {
  articleId: string;
  tenantId: string;
  steps: { step_order: number; assignment_group_id: string }[];
}): Promise<string> {
  const workflowId = `kb-approval-${params.articleId}`;
  try {
    const cl = await getClient();
    const handle = await cl.workflow.start('knowledgeApproval', {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [params],
      workflowExecutionTimeout: '30 days',
    });
    logger.info({ workflowId: handle.workflowId, articleId: params.articleId }, 'Started knowledge approval workflow');
    return handle.workflowId;
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info({ workflowId, articleId: params.articleId }, 'Knowledge approval workflow already running');
      return workflowId;
    }
    logger.error({ err, articleId: params.articleId }, 'Failed to start knowledge approval workflow');
    throw err;
  }
}

export async function signalKnowledgeApprovalDecision(
  articleId: string,
  stepOrder: number,
  decision: 'approved' | 'rejected',
): Promise<void> {
  try {
    const cl = await getClient();
    const handle = cl.workflow.getHandle(`kb-approval-${articleId}`);
    await handle.signal('kbApprovalDecision', { stepOrder, decision });
    logger.info({ articleId, stepOrder, decision }, 'Sent KB approval decision signal');
  } catch (err) {
    logger.warn({ err, articleId, stepOrder }, 'Could not signal KB approval workflow');
  }
}

export async function startNotificationDispatch(params: {
  tenantId: string;
  entityType: 'incident' | 'request' | 'change' | 'problem' | 'knowledge' | 'major_incident' | 'alert';
  triggerKey: string;
  entityId: string;
  actorUserId?: string | null;
  workflowId?: string;
}): Promise<string> {
  const workflowId = params.workflowId
    || `notification-dispatch-${params.entityType}-${params.entityId}-${params.triggerKey}-${Date.now()}`;
  try {
    const cl = await getClient();
    const handle = await cl.workflow.start('notificationDispatch', {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [params],
      workflowExecutionTimeout: '5 minutes',
    });
    logger.info(
      { workflowId: handle.workflowId, entityType: params.entityType, entityId: params.entityId, triggerKey: params.triggerKey },
      'Started notification dispatch workflow',
    );
    return handle.workflowId;
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info({ workflowId, triggerKey: params.triggerKey, entityId: params.entityId }, 'Notification dispatch workflow already running');
      return workflowId;
    }
    logger.warn({ err, triggerKey: params.triggerKey, entityId: params.entityId }, 'Failed to start notification dispatch workflow');
    throw err;
  }
}

/** Default: once daily at 02:00 UTC (same convention as data source sync default). */
export async function startMetricSnapshotSchedule(cronSchedule = '0 2 * * *'): Promise<string> {
  const workflowId = 'metric-snapshots-daily-schedule';
  try {
    const cl = await getClient();
    const handle = await cl.workflow.start('metricSnapshotsDaily', {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [],
      cronSchedule,
      workflowExecutionTimeout: '365 days',
    });
    logger.info({ workflowId: handle.workflowId, cronSchedule }, 'Started metric snapshot schedule workflow');
    return handle.workflowId;
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info({ workflowId, cronSchedule }, 'Metric snapshot schedule workflow already running');
      return workflowId;
    }
    logger.warn({ err, workflowId }, 'Failed to start metric snapshot schedule workflow');
    throw err;
  }
}

/** Default: once daily at 02:00 UTC (same convention as data source sync default). */
export async function startDbSizeSnapshotSchedule(cronSchedule = '0 2 * * *'): Promise<string> {
  const workflowId = 'system-metrics-db-size-snapshot-schedule';
  try {
    const cl = await getClient();
    const handle = await cl.workflow.start('systemMetricsDbSizeSnapshot', {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [],
      cronSchedule,
      workflowExecutionTimeout: '365 days',
    });
    logger.info({ workflowId: handle.workflowId, cronSchedule }, 'Started DB size snapshot schedule workflow');
    return handle.workflowId;
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info({ workflowId, cronSchedule }, 'DB size snapshot schedule workflow already running');
      return workflowId;
    }
    logger.warn({ err, workflowId }, 'Failed to start DB size snapshot schedule workflow');
    throw err;
  }
}

/** Default: daily at 02:15 UTC, after the metric snapshot jobs. */
export async function startProblemRecurrenceScanSchedule(cronSchedule = '15 2 * * *'): Promise<string> {
  const workflowId = 'problem-recurrence-scan-schedule';
  try {
    const cl = await getClient();
    const handle = await cl.workflow.start('problemRecurrenceScan', {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [],
      cronSchedule,
      workflowExecutionTimeout: '365 days',
    });
    logger.info({ workflowId: handle.workflowId, cronSchedule }, 'Started problem recurrence scan schedule');
    return handle.workflowId;
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info({ workflowId, cronSchedule }, 'Problem recurrence scan schedule already running');
      return workflowId;
    }
    logger.warn({ err, workflowId }, 'Failed to start problem recurrence scan schedule');
    throw err;
  }
}

/** Poll IMAP mailboxes; default every minute (each mailbox has its own poll_interval_seconds). */
export async function startInboundEmailPollSchedule(cronSchedule = '* * * * *'): Promise<string> {
  const workflowId = 'inbound-email-poll-schedule';
  try {
    const cl = await getClient();
    const handle = await cl.workflow.start('inboundEmailPoll', {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [],
      cronSchedule,
      workflowExecutionTimeout: '365 days',
    });
    logger.info({ workflowId: handle.workflowId, cronSchedule }, 'Started inbound email poll schedule');
    return handle.workflowId;
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info({ workflowId, cronSchedule }, 'Inbound email poll schedule already running');
      return workflowId;
    }
    logger.warn({ err, workflowId }, 'Failed to start inbound email poll schedule');
    throw err;
  }
}

export async function startMajorIncidentWorkflow(params: {
  majorIncidentId: string;
  tenantId: string;
  title: string;
}): Promise<string> {
  const workflowId = `major-incident-${params.majorIncidentId}`;
  try {
    const cl = await getClient();
    const handle = await cl.workflow.start('majorIncidentWorkflow', {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [params],
      workflowExecutionTimeout: '30 days',
    });
    logger.info({ workflowId: handle.workflowId, majorIncidentId: params.majorIncidentId }, 'Started major incident workflow');
    return handle.workflowId;
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info({ workflowId, majorIncidentId: params.majorIncidentId }, 'Major incident workflow already running');
      return workflowId;
    }
    logger.error({ err, majorIncidentId: params.majorIncidentId }, 'Failed to start major incident workflow');
    throw err;
  }
}

export async function signalMajorIncidentDeclareResolved(majorIncidentId: string): Promise<void> {
  try {
    const cl = await getClient();
    const handle = cl.workflow.getHandle(`major-incident-${majorIncidentId}`);
    await handle.signal('declareResolved');
    logger.info({ majorIncidentId }, 'Sent declareResolved to major incident workflow');
  } catch (err) {
    logger.warn({ err, majorIncidentId }, 'Could not signal major incident workflow declareResolved');
  }
}

export async function signalMajorIncidentStakeholderUpdate(majorIncidentId: string): Promise<void> {
  try {
    const cl = await getClient();
    const handle = cl.workflow.getHandle(`major-incident-${majorIncidentId}`);
    await handle.signal('stakeholderUpdatePosted');
    logger.info({ majorIncidentId }, 'Sent stakeholderUpdatePosted to major incident workflow');
  } catch (err) {
    logger.warn({ err, majorIncidentId }, 'Could not signal major incident stakeholder update');
  }
}

export async function queryMajorIncidentWorkflowStatus(majorIncidentId: string): Promise<{
  phase: string;
  majorIncidentId: string;
} | null> {
  try {
    const cl = await getClient();
    const handle = cl.workflow.getHandle(`major-incident-${majorIncidentId}`);
    return await handle.query('getMajorIncidentStatus');
  } catch (err) {
    logger.warn({ err, majorIncidentId }, 'Could not query major incident workflow');
    return null;
  }
}

export async function startDataManagementJob(params: {
  jobId: string;
  tenantId: string;
}): Promise<string> {
  const workflowId = `data-management-${params.jobId}`;
  try {
    const cl = await getClient();
    const handle = await cl.workflow.start('dataManagementJob', {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [{ jobId: params.jobId, tenantId: params.tenantId }],
      workflowExecutionTimeout: '6 hours',
    });
    logger.info({ workflowId: handle.workflowId, jobId: params.jobId }, 'Started data management job');
    return handle.workflowId;
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      logger.info({ workflowId, jobId: params.jobId }, 'Data management job already running');
      return workflowId;
    }
    logger.error({ err, jobId: params.jobId }, 'Failed to start data management job');
    throw err;
  }
}

export async function signalPostmortemPublished(postmortemId: string): Promise<void> {
  try {
    const cl = await getClient();
    const handle = cl.workflow.getHandle(`postmortem-${postmortemId}`);
    await handle.signal('postmortemPublished');
    logger.info({ postmortemId }, 'Sent postmortemPublished signal');
  } catch (err) {
    logger.warn({ err, postmortemId }, 'Could not signal postmortem workflow');
  }
}
