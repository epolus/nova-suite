/* SPDX-License-Identifier: AGPL-3.0-only */
import { Connection, Client, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { config } from '../config';
import { logger } from '../logger';

const TASK_QUEUE = config.temporal.taskQueue;

let connection: Connection | null = null;
let client: Client | null = null;

async function getClient(): Promise<Client> {
  if (!client) {
    connection = await Connection.connect({ address: config.temporal.address });
    client = new Client({ connection, namespace: config.temporal.namespace });
  }
  return client;
}

export async function startIncidentEscalation(params: {
  incidentId: string;
  tenantId: string;
  priority: number;
  slaDueAt: string;
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

export async function startDataSourceSync(params: {
  dataSourceId: string;
  tenantId: string;
  cronSchedule?: string;
  immediate?: boolean;
}): Promise<string> {
  const workflowId = params.immediate
    ? `datasource-run-${params.dataSourceId}-${Date.now()}`
    : `datasource-schedule-${params.dataSourceId}`;
  try {
    const cl = await getClient();

    // Cancel existing scheduled workflow if re-scheduling
    if (!params.immediate) {
      try {
        const existing = cl.workflow.getHandle(workflowId);
        await existing.cancel();
      } catch { /* no existing workflow */ }
    }

    const opts: Record<string, unknown> = {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [{
        dataSourceId: params.dataSourceId,
        tenantId: params.tenantId,
        triggerType: params.immediate ? 'manual' : 'scheduled',
      }],
      workflowExecutionTimeout: '2 hours',
    };

    if (!params.immediate && params.cronSchedule) {
      opts.cronSchedule = params.cronSchedule;
    }

    const handle = await cl.workflow.start('dataSourceSync', opts as any);
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
  try {
    const cl = await getClient();
    const handle = cl.workflow.getHandle(`datasource-schedule-${dataSourceId}`);
    await handle.cancel();
    logger.info({ dataSourceId }, 'Cancelled data source schedule');
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
  entityType: 'incident' | 'request' | 'change' | 'problem' | 'knowledge';
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
