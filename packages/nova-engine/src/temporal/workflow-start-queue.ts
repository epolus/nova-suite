/* SPDX-License-Identifier: AGPL-3.0-only */
import { db } from '../data/db';
import { logger } from '../logger';
import {
  checkTemporalHealth,
  startCatalogFulfillment,
  startDataSourceSync,
  startIncidentAutoClose,
  startIncidentEscalation,
  startKnowledgeApproval,
  startMajorIncidentWorkflow,
  startNotificationDispatch,
} from './workflows';

type WorkflowStartJobType =
  | 'catalog_fulfillment_start'
  | 'notification_dispatch_start'
  | 'incident_escalation_start'
  | 'incident_autoclose_start'
  | 'datasource_schedule_start'
  | 'knowledge_approval_start'
  | 'major_incident_workflow_start';

type WorkflowStartJobRow = {
  id: string;
  tenant_id: string;
  job_type: WorkflowStartJobType;
  workflow_id: string;
  payload: unknown;
  attempt_count: number;
  max_attempts: number;
};

type CatalogFulfillmentPayload = {
  requestId: string;
  serviceItemId: string;
};

type NotificationDispatchPayload = {
  entityType: 'incident' | 'request' | 'change' | 'problem' | 'knowledge' | 'major_incident';
  triggerKey: string;
  entityId: string;
  actorUserId?: string | null;
};

type IncidentEscalationPayload = {
  incidentId: string;
  priority: number;
  slaDueAt: string;
};

type IncidentAutoClosePayload = {
  incidentId: string;
  autoCloseAfterDays?: number;
};

type DataSourceSchedulePayload = {
  dataSourceId: string;
  cronSchedule?: string;
};

type KnowledgeApprovalPayload = {
  articleId: string;
  steps: { step_order: number; assignment_group_id: string }[];
};

type MajorIncidentWorkflowPayload = {
  majorIncidentId: string;
  title: string;
};

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_BATCH_SIZE = 20;
const STALE_PROCESSING_MINUTES = 5;
const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
const SYSTEM_ROLES = 'system';

let dispatcherTimer: NodeJS.Timeout | null = null;
let dispatcherRunning = false;

async function withSystemClient<T>(fn: (queryable: Queryable) => Promise<T>): Promise<T> {
  const client = await db.getClient();
  try {
    await db.setTenantContext(client, SYSTEM_TENANT_ID, SYSTEM_USER_ID, SYSTEM_ROLES);
    return await fn(client);
  } finally {
    await client.query(
      `SELECT set_config('app.current_tenant_id', '', false),
              set_config('app.current_user_id', '', false),
              set_config('app.current_user_roles', '', false)`,
    ).catch(() => {});
    client.release();
  }
}

async function systemQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[] }> {
  return withSystemClient(async (queryable) => {
    const result = await queryable.query(text, params);
    return result as { rows: T[] };
  });
}

async function runWithQueryable(
  queryable: Queryable | undefined,
  text: string,
  params?: unknown[],
): Promise<void> {
  if (queryable) {
    await queryable.query(text, params);
    return;
  }
  await systemQuery(text, params);
}

function getRetryDelaySeconds(attemptCount: number): number {
  // 5s, 10s, 20s, 40s ... capped at 5 minutes
  const delay = 5 * (2 ** Math.max(0, attemptCount));
  return Math.min(delay, 300);
}

function isCatalogFulfillmentPayload(value: unknown): value is CatalogFulfillmentPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.requestId === 'string' && typeof v.serviceItemId === 'string';
}

function isNotificationDispatchPayload(value: unknown): value is NotificationDispatchPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const entityType = v.entityType;
  return (
    typeof v.triggerKey === 'string'
    && typeof v.entityId === 'string'
    && (entityType === 'incident'
      || entityType === 'request'
      || entityType === 'change'
      || entityType === 'problem'
      || entityType === 'knowledge'
      || entityType === 'major_incident')
  );
}

function isIncidentEscalationPayload(value: unknown): value is IncidentEscalationPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.incidentId === 'string'
    && typeof v.priority === 'number'
    && Number.isFinite(v.priority)
    && typeof v.slaDueAt === 'string'
  );
}

function isIncidentAutoClosePayload(value: unknown): value is IncidentAutoClosePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.incidentId === 'string'
    && (v.autoCloseAfterDays === undefined
      || (typeof v.autoCloseAfterDays === 'number' && Number.isFinite(v.autoCloseAfterDays)))
  );
}

function isDataSourceSchedulePayload(value: unknown): value is DataSourceSchedulePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.dataSourceId === 'string' && (v.cronSchedule === undefined || typeof v.cronSchedule === 'string');
}

function isKnowledgeApprovalPayload(value: unknown): value is KnowledgeApprovalPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.articleId !== 'string' || !Array.isArray(v.steps)) return false;
  return v.steps.every((step) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) return false;
    const s = step as Record<string, unknown>;
    return typeof s.step_order === 'number' && Number.isFinite(s.step_order) && typeof s.assignment_group_id === 'string';
  });
}

function isMajorIncidentWorkflowPayload(value: unknown): value is MajorIncidentWorkflowPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.majorIncidentId === 'string' && typeof v.title === 'string';
}

async function recoverStaleProcessingJobs(): Promise<void> {
  await systemQuery(
    `UPDATE workflow_start_jobs
     SET status = 'pending',
         locked_at = NULL,
         updated_at = now()
     WHERE status = 'processing'
       AND locked_at < now() - make_interval(mins => $1::int)`,
    [STALE_PROCESSING_MINUTES],
  );
}

async function fastForwardConnectivityRetriesIfRecovered(): Promise<void> {
  const temporalHealthy = await checkTemporalHealth(1000).catch(() => false);
  if (!temporalHealthy) return;

  await systemQuery(
    `UPDATE workflow_start_jobs
     SET next_attempt_at = now(),
         updated_at = now()
     WHERE status = 'pending'
       AND next_attempt_at > now()
       AND (
         COALESCE(last_error, '') ILIKE '%temporal%'
         OR COALESCE(last_error, '') ILIKE '%connect%'
         OR COALESCE(last_error, '') ILIKE '%deadline%'
         OR COALESCE(last_error, '') ILIKE '%unavailable%'
       )`,
  );
}

async function claimDueJobs(limit: number): Promise<WorkflowStartJobRow[]> {
  const result = await systemQuery<WorkflowStartJobRow>(
    `WITH due AS (
       SELECT id
       FROM workflow_start_jobs
       WHERE status = 'pending'
         AND next_attempt_at <= now()
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE workflow_start_jobs wsj
     SET status = 'processing',
         locked_at = now(),
         updated_at = now()
     FROM due
     WHERE wsj.id = due.id
     RETURNING wsj.id, wsj.tenant_id, wsj.job_type, wsj.workflow_id, wsj.payload, wsj.attempt_count, wsj.max_attempts`,
    [limit],
  );
  return result.rows;
}

async function markJobCompleted(jobId: string): Promise<void> {
  await systemQuery(
    `UPDATE workflow_start_jobs
     SET status = 'completed',
         completed_at = now(),
         locked_at = NULL,
         last_error = NULL,
         updated_at = now()
     WHERE id = $1`,
    [jobId],
  );
}

async function markJobFailed(job: WorkflowStartJobRow, errorMessage: string): Promise<void> {
  const nextAttemptCount = job.attempt_count + 1;
  const exceededMaxAttempts = job.max_attempts > 0 && nextAttemptCount >= job.max_attempts;
  if (exceededMaxAttempts) {
    await systemQuery(
      `UPDATE workflow_start_jobs
       SET status = 'failed',
           attempt_count = $2,
           locked_at = NULL,
           last_error = $3,
           updated_at = now()
       WHERE id = $1`,
      [job.id, nextAttemptCount, errorMessage],
    );
    return;
  }

  const retryDelaySeconds = getRetryDelaySeconds(job.attempt_count);
  await systemQuery(
    `UPDATE workflow_start_jobs
     SET status = 'pending',
         attempt_count = $2,
         next_attempt_at = now() + make_interval(secs => $3::int),
         locked_at = NULL,
         last_error = $4,
         updated_at = now()
     WHERE id = $1`,
    [job.id, nextAttemptCount, retryDelaySeconds, errorMessage],
  );
}

async function processJob(job: WorkflowStartJobRow): Promise<void> {
  try {
    if (job.job_type === 'catalog_fulfillment_start') {
      if (!isCatalogFulfillmentPayload(job.payload)) {
        throw new Error('Invalid payload for catalog fulfillment workflow start job');
      }
      await startCatalogFulfillment({
        requestId: job.payload.requestId,
        tenantId: job.tenant_id,
        serviceItemId: job.payload.serviceItemId,
      });
      await markJobCompleted(job.id);
      return;
    }

    if (job.job_type === 'notification_dispatch_start') {
      if (!isNotificationDispatchPayload(job.payload)) {
        throw new Error('Invalid payload for notification dispatch workflow start job');
      }
      await startNotificationDispatch({
        tenantId: job.tenant_id,
        entityType: job.payload.entityType,
        triggerKey: job.payload.triggerKey,
        entityId: job.payload.entityId,
        actorUserId: job.payload.actorUserId ?? null,
        workflowId: job.workflow_id,
      });
      await markJobCompleted(job.id);
      return;
    }

    if (job.job_type === 'incident_escalation_start') {
      if (!isIncidentEscalationPayload(job.payload)) {
        throw new Error('Invalid payload for incident escalation workflow start job');
      }
      await startIncidentEscalation({
        incidentId: job.payload.incidentId,
        tenantId: job.tenant_id,
        priority: job.payload.priority,
        slaDueAt: job.payload.slaDueAt,
      });
      await markJobCompleted(job.id);
      return;
    }

    if (job.job_type === 'incident_autoclose_start') {
      if (!isIncidentAutoClosePayload(job.payload)) {
        throw new Error('Invalid payload for incident auto-close workflow start job');
      }
      await startIncidentAutoClose({
        incidentId: job.payload.incidentId,
        tenantId: job.tenant_id,
        autoCloseAfterDays: job.payload.autoCloseAfterDays,
      });
      await markJobCompleted(job.id);
      return;
    }

    if (job.job_type === 'datasource_schedule_start') {
      if (!isDataSourceSchedulePayload(job.payload)) {
        throw new Error('Invalid payload for data source schedule workflow start job');
      }
      await startDataSourceSync({
        dataSourceId: job.payload.dataSourceId,
        tenantId: job.tenant_id,
        cronSchedule: job.payload.cronSchedule,
      });
      await markJobCompleted(job.id);
      return;
    }

    if (job.job_type === 'knowledge_approval_start') {
      if (!isKnowledgeApprovalPayload(job.payload)) {
        throw new Error('Invalid payload for knowledge approval workflow start job');
      }
      await startKnowledgeApproval({
        articleId: job.payload.articleId,
        tenantId: job.tenant_id,
        steps: job.payload.steps,
      });
      await markJobCompleted(job.id);
      return;
    }

    if (job.job_type === 'major_incident_workflow_start') {
      if (!isMajorIncidentWorkflowPayload(job.payload)) {
        throw new Error('Invalid payload for major incident workflow start job');
      }
      await startMajorIncidentWorkflow({
        majorIncidentId: job.payload.majorIncidentId,
        tenantId: job.tenant_id,
        title: job.payload.title,
      });
      await markJobCompleted(job.id);
      return;
    }

    throw new Error(`Unsupported workflow start job type: ${job.job_type}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'unknown workflow start queue error';
    await markJobFailed(job, errorMessage);
    logger.warn(
      { err, jobId: job.id, jobType: job.job_type, tenantId: job.tenant_id, workflowId: job.workflow_id },
      'Workflow start queue job failed',
    );
  }
}

async function drainWorkflowStartQueue(): Promise<void> {
  if (dispatcherRunning) return;
  dispatcherRunning = true;
  try {
    await recoverStaleProcessingJobs();
    await fastForwardConnectivityRetriesIfRecovered();
    const jobs = await claimDueJobs(DEFAULT_BATCH_SIZE);
    if (jobs.length === 0) return;

    for (const job of jobs) {
      await processJob(job);
    }
  } catch (err) {
    logger.warn({ err }, 'Workflow start queue poll cycle failed');
  } finally {
    dispatcherRunning = false;
  }
}

export async function enqueueCatalogFulfillmentStartJob(params: {
  tenantId: string;
  requestId: string;
  serviceItemId: string;
  queryable?: Queryable;
}): Promise<void> {
  const workflowId = `catalog-fulfillment-${params.requestId}`;
  await runWithQueryable(
    params.queryable,
    `INSERT INTO workflow_start_jobs (
       tenant_id, job_type, workflow_id, payload, status, attempt_count, max_attempts, next_attempt_at
     ) VALUES (
       $1, 'catalog_fulfillment_start', $2, $3::jsonb, 'pending', 0, 0, now()
     )
     ON CONFLICT (tenant_id, job_type, workflow_id)
     DO UPDATE SET
       payload = EXCLUDED.payload,
       status = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.status ELSE 'pending' END,
       next_attempt_at = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.next_attempt_at ELSE now() END,
       locked_at = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.locked_at ELSE NULL END,
       last_error = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.last_error ELSE NULL END,
       updated_at = now()`,
    [
      params.tenantId,
      workflowId,
      JSON.stringify({
        requestId: params.requestId,
        serviceItemId: params.serviceItemId,
      }),
    ],
  );
}

export async function enqueueNotificationDispatchStartJob(params: {
  tenantId: string;
  entityType: 'incident' | 'request' | 'change' | 'problem' | 'knowledge' | 'major_incident';
  triggerKey: string;
  entityId: string;
  actorUserId?: string | null;
  queryable?: Queryable;
}): Promise<void> {
  const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const workflowId = `notification-dispatch-${params.entityType}-${params.entityId}-${params.triggerKey}-${uniqueSuffix}`;
  await runWithQueryable(
    params.queryable,
    `INSERT INTO workflow_start_jobs (
       tenant_id, job_type, workflow_id, payload, status, attempt_count, max_attempts, next_attempt_at
     ) VALUES (
       $1, 'notification_dispatch_start', $2, $3::jsonb, 'pending', 0, 0, now()
     )`,
    [
      params.tenantId,
      workflowId,
      JSON.stringify({
        entityType: params.entityType,
        triggerKey: params.triggerKey,
        entityId: params.entityId,
        actorUserId: params.actorUserId ?? null,
      }),
    ],
  );
}

export async function enqueueIncidentEscalationStartJob(params: {
  tenantId: string;
  incidentId: string;
  priority: number;
  slaDueAt: string;
  queryable?: Queryable;
}): Promise<void> {
  const workflowId = `incident-escalation-${params.incidentId}`;
  await runWithQueryable(
    params.queryable,
    `INSERT INTO workflow_start_jobs (
       tenant_id, job_type, workflow_id, payload, status, attempt_count, max_attempts, next_attempt_at
     ) VALUES (
       $1, 'incident_escalation_start', $2, $3::jsonb, 'pending', 0, 0, now()
     )
     ON CONFLICT (tenant_id, job_type, workflow_id)
     DO UPDATE SET
       payload = EXCLUDED.payload,
       status = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.status ELSE 'pending' END,
       next_attempt_at = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.next_attempt_at ELSE now() END,
       locked_at = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.locked_at ELSE NULL END,
       last_error = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.last_error ELSE NULL END,
       updated_at = now()`,
    [
      params.tenantId,
      workflowId,
      JSON.stringify({
        incidentId: params.incidentId,
        priority: params.priority,
        slaDueAt: params.slaDueAt,
      }),
    ],
  );
}

export async function enqueueIncidentAutoCloseStartJob(params: {
  tenantId: string;
  incidentId: string;
  autoCloseAfterDays?: number;
  queryable?: Queryable;
}): Promise<void> {
  const workflowId = `incident-autoclose-${params.incidentId}`;
  await runWithQueryable(
    params.queryable,
    `INSERT INTO workflow_start_jobs (
       tenant_id, job_type, workflow_id, payload, status, attempt_count, max_attempts, next_attempt_at
     ) VALUES (
       $1, 'incident_autoclose_start', $2, $3::jsonb, 'pending', 0, 0, now()
     )
     ON CONFLICT (tenant_id, job_type, workflow_id)
     DO UPDATE SET
       payload = EXCLUDED.payload,
       status = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.status ELSE 'pending' END,
       next_attempt_at = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.next_attempt_at ELSE now() END,
       locked_at = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.locked_at ELSE NULL END,
       last_error = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.last_error ELSE NULL END,
       updated_at = now()`,
    [
      params.tenantId,
      workflowId,
      JSON.stringify({
        incidentId: params.incidentId,
        autoCloseAfterDays: params.autoCloseAfterDays,
      }),
    ],
  );
}

export async function enqueueDataSourceScheduleStartJob(params: {
  tenantId: string;
  dataSourceId: string;
  cronSchedule?: string;
  queryable?: Queryable;
}): Promise<void> {
  const workflowId = `datasource-schedule-${params.dataSourceId}`;
  await runWithQueryable(
    params.queryable,
    `INSERT INTO workflow_start_jobs (
       tenant_id, job_type, workflow_id, payload, status, attempt_count, max_attempts, next_attempt_at
     ) VALUES (
       $1, 'datasource_schedule_start', $2, $3::jsonb, 'pending', 0, 0, now()
     )
     ON CONFLICT (tenant_id, job_type, workflow_id)
     DO UPDATE SET
       payload = EXCLUDED.payload,
       status = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.status ELSE 'pending' END,
       next_attempt_at = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.next_attempt_at ELSE now() END,
       locked_at = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.locked_at ELSE NULL END,
       last_error = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.last_error ELSE NULL END,
       updated_at = now()`,
    [
      params.tenantId,
      workflowId,
      JSON.stringify({
        dataSourceId: params.dataSourceId,
        cronSchedule: params.cronSchedule,
      }),
    ],
  );
}

export async function enqueueKnowledgeApprovalStartJob(params: {
  tenantId: string;
  articleId: string;
  steps: { step_order: number; assignment_group_id: string }[];
  queryable?: Queryable;
}): Promise<void> {
  const workflowId = `kb-approval-${params.articleId}`;
  await runWithQueryable(
    params.queryable,
    `INSERT INTO workflow_start_jobs (
       tenant_id, job_type, workflow_id, payload, status, attempt_count, max_attempts, next_attempt_at
     ) VALUES (
       $1, 'knowledge_approval_start', $2, $3::jsonb, 'pending', 0, 0, now()
     )
     ON CONFLICT (tenant_id, job_type, workflow_id)
     DO UPDATE SET
       payload = EXCLUDED.payload,
       status = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.status ELSE 'pending' END,
       next_attempt_at = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.next_attempt_at ELSE now() END,
       locked_at = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.locked_at ELSE NULL END,
       last_error = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.last_error ELSE NULL END,
       updated_at = now()`,
    [
      params.tenantId,
      workflowId,
      JSON.stringify({
        articleId: params.articleId,
        steps: params.steps,
      }),
    ],
  );
}

export async function enqueueMajorIncidentWorkflowStartJob(params: {
  tenantId: string;
  majorIncidentId: string;
  title: string;
  queryable?: Queryable;
}): Promise<void> {
  const workflowId = `major-incident-${params.majorIncidentId}`;
  await runWithQueryable(
    params.queryable,
    `INSERT INTO workflow_start_jobs (
       tenant_id, job_type, workflow_id, payload, status, attempt_count, max_attempts, next_attempt_at
     ) VALUES (
       $1, 'major_incident_workflow_start', $2, $3::jsonb, 'pending', 0, 0, now()
     )
     ON CONFLICT (tenant_id, job_type, workflow_id)
     DO UPDATE SET
       payload = EXCLUDED.payload,
       status = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.status ELSE 'pending' END,
       next_attempt_at = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.next_attempt_at ELSE now() END,
       locked_at = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.locked_at ELSE NULL END,
       last_error = CASE WHEN workflow_start_jobs.status = 'completed' THEN workflow_start_jobs.last_error ELSE NULL END,
       updated_at = now()`,
    [
      params.tenantId,
      workflowId,
      JSON.stringify({
        majorIncidentId: params.majorIncidentId,
        title: params.title,
      }),
    ],
  );
}

export function startWorkflowStartQueueDispatcher(): void {
  if (dispatcherTimer) return;
  dispatcherTimer = setInterval(() => {
    void drainWorkflowStartQueue();
  }, DEFAULT_POLL_INTERVAL_MS);
  // Try once immediately on startup so recovered Temporal can catch up quickly.
  void drainWorkflowStartQueue();
  logger.info(
    { pollIntervalMs: DEFAULT_POLL_INTERVAL_MS, batchSize: DEFAULT_BATCH_SIZE },
    'Started workflow start queue dispatcher',
  );
}

export function stopWorkflowStartQueueDispatcher(): void {
  if (!dispatcherTimer) return;
  clearInterval(dispatcherTimer);
  dispatcherTimer = null;
}

export async function getWorkflowStartQueueStats(): Promise<{ pending: number; failed: number }> {
  const rows = await systemQuery<{ pending: number; failed: number }>(
    `SELECT
       count(*) FILTER (WHERE status = 'pending')::int AS pending,
       count(*) FILTER (WHERE status = 'failed')::int AS failed
     FROM workflow_start_jobs`,
  );
  return rows.rows[0] || { pending: 0, failed: 0 };
}

