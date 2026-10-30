/* SPDX-License-Identifier: AGPL-3.0-only */
import { log } from '@temporalio/activity';
import {
  AUTOMATION_SCHEMA_VERSION,
  collectCredSlugsFromAutomation,
  evaluateAdvancedCondition,
  executeAutomationGraph,
  parseAutomationConfig,
  resolveCredentialTemplateValues,
  toHttpActivityState,
  type AutomationCheckpoint,
  type AutomationResumeOutcome,
  type AutomationSuspension,
} from '@nova-suite/shared';
import { config } from '../config';
import { withTenantContext } from '../db';
import { loadCredentialSecretsBySlugs } from '@nova-suite/shared/node';
import { getEmailProvider } from './email-provider';

export interface ExecuteAutomatedCatalogTaskInput {
  requestTaskId: string;
  requestId: string;
  tenantId: string;
  /** Set when resuming after an in-flow approval or manual task was completed by a human. */
  resumeOutcome?: AutomationResumeOutcome;
}

export interface ExecuteAutomatedCatalogTaskResult {
  ok: boolean;
  message?: string;
  rejectRequest?: boolean;
  skipTaskOrders?: number[];
  /** The automation is paused until this child request_task (approval or manual) is completed. */
  suspended?: { approvalTaskId: string; taskKind?: 'approval' | 'manual' };
}

type ApprovalSuspension = Extract<AutomationSuspension, { kind: 'approval' }>;
type TaskSuspension = Extract<AutomationSuspension, { kind: 'task' }>;

type QueryClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveApprovalAssignee(
  client: QueryClient,
  tenantId: string,
  request: Record<string, unknown>,
  approval: ApprovalSuspension['approval'],
): Promise<{ assignedTo: string | null; assignedGroupId: string | null; note: string | null }> {
  const approver = approval.approver.trim();
  const byIdOrName = UUID_RE.test(approver) ? approver : null;
  if (approval.approverType === 'user') {
    const r = await client.query(
      `SELECT id FROM users
       WHERE tenant_id = $1 AND (($2::uuid IS NOT NULL AND id = $2::uuid) OR lower(email) = lower($3) OR lower(user_id) = lower($3))
       LIMIT 1`,
      [tenantId, byIdOrName, approver],
    );
    const id = (r.rows[0]?.id as string | undefined) ?? null;
    return { assignedTo: id, assignedGroupId: null, note: id ? null : `Approver user "${approver}" not found.` };
  }
  if (approval.approverType === 'group' || approval.approverType === 'group_manager') {
    const r = await client.query(
      `SELECT id, manager_id FROM assignment_groups
       WHERE tenant_id = $1 AND (($2::uuid IS NOT NULL AND id = $2::uuid) OR lower(name) = lower($3))
       LIMIT 1`,
      [tenantId, byIdOrName, approver],
    );
    const row = r.rows[0];
    if (!row) return { assignedTo: null, assignedGroupId: null, note: `Approver group "${approver}" not found.` };
    if (approval.approverType === 'group') return { assignedTo: null, assignedGroupId: row.id as string, note: null };
    const managerId = (row.manager_id as string | null) ?? null;
    return {
      assignedTo: managerId,
      assignedGroupId: null,
      note: managerId ? null : `Group "${approver}" has no manager.`,
    };
  }
  const subjectId = (request.requested_for as string | null) ?? (request.requester_id as string | null);
  const r = await client.query(`SELECT manager_id FROM users WHERE id = $1`, [subjectId]);
  const managerId = (r.rows[0]?.manager_id as string | null | undefined) ?? null;
  return { assignedTo: managerId, assignedGroupId: null, note: managerId ? null : 'Request subject has no manager.' };
}

async function createInFlowApprovalTask(
  client: QueryClient,
  tenantId: string,
  requestId: string,
  parentTaskId: string,
  taskOrder: number,
  request: Record<string, unknown>,
  approval: ApprovalSuspension['approval'],
): Promise<string> {
  const assignee = await resolveApprovalAssignee(client, tenantId, request, approval);
  const seq = await client.query("SELECT nextval('task_number_seq')");
  const number = `TASK${String(seq.rows[0].nextval).padStart(7, '0')}`;
  const notes = assignee.note ? `${assignee.note} An administrator must decide this approval.` : null;
  const inserted = await client.query(
    `INSERT INTO request_tasks (
       tenant_id, number, request_id, parent_task_id, task_order, name, instructions, task_type,
       assigned_to, assigned_group_id, status, started_at, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'approval', $8, $9, 'in_progress', now(), $10)
     RETURNING id`,
    [
      tenantId,
      number,
      requestId,
      parentTaskId,
      taskOrder,
      approval.name || 'Approval',
      approval.instructions || null,
      assignee.assignedTo,
      assignee.assignedGroupId,
      notes,
    ],
  );
  const approvalTaskId = inserted.rows[0].id as string;
  if (assignee.assignedTo) {
    await client.query(
      `INSERT INTO notifications (tenant_id, user_id, type, title, body, entity_type, entity_id)
       VALUES ($1, $2, 'assignment', $3, $4, 'request', $5)`,
      [
        tenantId,
        assignee.assignedTo,
        `${String(request.number ?? 'Request')}: approval required`,
        `Please review task "${approval.name || 'Approval'}".`,
        requestId,
      ],
    );
  }
  return approvalTaskId;
}

async function createInFlowManualTask(
  client: QueryClient,
  tenantId: string,
  requestId: string,
  parentTaskId: string,
  taskOrder: number,
  task: TaskSuspension['task'],
): Promise<string> {
  const notes: string[] = [];
  let assignedGroupId: string | null = null;
  const group = task.group.trim();
  if (group) {
    const r = await client.query(
      `SELECT id FROM assignment_groups
       WHERE tenant_id = $1 AND (($2::uuid IS NOT NULL AND id = $2::uuid) OR lower(name) = lower($3))
       LIMIT 1`,
      [tenantId, UUID_RE.test(group) ? group : null, group],
    );
    assignedGroupId = (r.rows[0]?.id as string | undefined) ?? null;
    if (!assignedGroupId) notes.push(`Assignment group "${group}" not found.`);
  }
  let assignedTo: string | null = null;
  const assignee = task.assignee.trim();
  if (assignee) {
    const r = await client.query(
      `SELECT id FROM users
       WHERE tenant_id = $1 AND (($2::uuid IS NOT NULL AND id = $2::uuid) OR lower(email) = lower($3))
       LIMIT 1`,
      [tenantId, UUID_RE.test(assignee) ? assignee : null, assignee],
    );
    assignedTo = (r.rows[0]?.id as string | undefined) ?? null;
    if (!assignedTo) notes.push(`Assignee "${assignee}" not found.`);
  }
  // Non-waiting tasks are recorded for audit but completed immediately so fulfillment gates do not stall.
  const wait = task.wait !== false;
  if (!wait) notes.push('Created without waiting; marked completed so the flow can continue.');
  const seq = await client.query("SELECT nextval('task_number_seq')");
  const number = `TASK${String(seq.rows[0].nextval).padStart(7, '0')}`;
  const inserted = await client.query(
    `INSERT INTO request_tasks (
       tenant_id, number, request_id, parent_task_id, task_order, name, instructions, task_type,
       assigned_to, assigned_group_id, status, started_at, completed_at, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8, $9, $10, now(), $11, $12)
     RETURNING id`,
    [
      tenantId,
      number,
      requestId,
      parentTaskId,
      taskOrder,
      task.name.slice(0, 255) || 'Manual task',
      task.instructions || null,
      assignedTo,
      assignedGroupId,
      wait ? 'in_progress' : 'completed',
      wait ? null : new Date(),
      notes.length ? notes.join(' ') : null,
    ],
  );
  return inserted.rows[0].id as string;
}

function parseCheckpoint(raw: unknown): AutomationCheckpoint | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cp = raw as Partial<AutomationCheckpoint>;
  if (cp.version !== 1 || typeof cp.stateId !== 'string') return null;
  return {
    version: 1,
    stateId: cp.stateId,
    stateResults: cp.stateResults ?? {},
    vars: cp.vars ?? {},
    loops: cp.loops ?? {},
    steps: typeof cp.steps === 'number' ? cp.steps : 0,
    trace: Array.isArray(cp.trace) ? cp.trace : [],
  };
}

function truncateNotes(s: string, max = 8000): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

export async function skipRequestTasksByOrders(
  requestId: string,
  tenantId: string,
  taskOrders: number[],
): Promise<void> {
  if (taskOrders.length === 0) return;
  log.info('Skipping request tasks by orders', { requestId, taskOrders });
  await withTenantContext(tenantId, async (client) => {
    await client.query(
      `UPDATE request_tasks
       SET status = 'skipped',
           notes = COALESCE(notes, '') || E'\nSkipped by catalog automation branch.',
           completed_at = now()
       WHERE request_id = $1 AND task_order = ANY($2::int[])
         AND parent_task_id IS NULL
         AND status IN ('pending', 'in_progress')`,
      [requestId, taskOrders],
    );
  });
}

export async function executeAutomatedCatalogTask(
  input: ExecuteAutomatedCatalogTaskInput,
): Promise<ExecuteAutomatedCatalogTaskResult> {
  const { requestTaskId, requestId, tenantId, resumeOutcome } = input;
  log.info('executeAutomatedCatalogTask', { requestTaskId, requestId, resumeOutcome });

  return withTenantContext(tenantId, async (client) => {
    const taskRow = await client.query(
      `SELECT rt.id, rt.task_order, rt.task_type, rt.status, rt.name, rt.automation_checkpoint,
              ct.automation_config
       FROM request_tasks rt
       LEFT JOIN catalog_tasks ct ON ct.id = rt.catalog_task_id
       WHERE rt.id = $1 AND rt.request_id = $2`,
      [requestTaskId, requestId],
    );
    if (taskRow.rows.length === 0) {
      return { ok: false, message: 'Request task not found', rejectRequest: true };
    }

    const row = taskRow.rows[0] as Record<string, unknown>;
    if (row.task_type !== 'automated') return { ok: false, message: 'Not an automated task', rejectRequest: true };
    if (row.status !== 'in_progress' && row.status !== 'pending') return { ok: true, message: 'Task already finalized' };

    const cfg = parseAutomationConfig(row.automation_config);
    if (!cfg) {
      const msg = `Invalid or missing automation_config (expected kind state_machine, schemaVersion=${AUTOMATION_SCHEMA_VERSION}, startAt/states).`;
      await client.query(
        `UPDATE request_tasks SET status = 'failed', completed_at = now(), notes = $1 WHERE id = $2`,
        [msg, requestTaskId],
      );
      return { ok: false, message: msg };
    }

    const reqRes = await client.query(
      `SELECT r.id, r.number, r.status, r.form_data, r.delivery_info, r.requester_id, r.requested_for,
              si.name AS service_item_name
       FROM requests r
       LEFT JOIN service_items si ON si.id = r.service_item_id
       WHERE r.id = $1`,
      [requestId],
    );
    if (reqRes.rows.length === 0) {
      const msg = 'Request not found (RLS or missing row)';
      await client.query(
        `UPDATE request_tasks SET status = 'failed', completed_at = now(), notes = $1 WHERE id = $2`,
        [msg, requestTaskId],
      );
      return { ok: false, message: msg, rejectRequest: true };
    }

    const request = reqRes.rows[0] as Record<string, unknown>;
    if (!resumeOutcome && row.automation_checkpoint) {
      const pending = await client.query(
        `SELECT id, task_type FROM request_tasks
         WHERE parent_task_id = $1 AND task_type IN ('approval', 'manual') AND status IN ('pending', 'in_progress')
         ORDER BY created_at DESC LIMIT 1`,
        [requestTaskId],
      );
      if (pending.rows[0]) {
        const taskKind = pending.rows[0].task_type === 'manual' ? 'manual' : 'approval';
        return {
          ok: true,
          message: `Awaiting in-flow ${taskKind} task`,
          suspended: { approvalTaskId: pending.rows[0].id as string, taskKind },
        };
      }
    }
    let resume: { checkpoint: AutomationCheckpoint; outcome: AutomationResumeOutcome } | undefined;
    if (resumeOutcome) {
      const checkpoint = parseCheckpoint(row.automation_checkpoint);
      if (!checkpoint) {
        const msg = 'Cannot resume automation: no approval checkpoint stored on the task.';
        await client.query(
          `UPDATE request_tasks SET status = 'failed', completed_at = now(), notes = $1 WHERE id = $2`,
          [msg, requestTaskId],
        );
        return { ok: false, message: msg, rejectRequest: true };
      }
      resume = { checkpoint, outcome: resumeOutcome };
    }
    try {
      const slugList = collectCredSlugsFromAutomation(cfg);
      const rawCredMap = await loadCredentialSecretsBySlugs(client, config.credentials.masterKey, tenantId, slugList);
      const credMap = await resolveCredentialTemplateValues(tenantId, rawCredMap, (msg, meta) =>
        log.info(msg, meta),
      );

      const emailProvider = getEmailProvider();
      const run = (resumeWith: typeof resume) => executeAutomationGraph({
        cfg,
        request,
        credMap,
        requestId,
        requestTaskId,
        tenantId,
        client,
        automationSharedKey: process.env.CATALOG_AUTOMATION_SHARED_KEY,
        sendEmail: async (input) => {
          const sent = await emailProvider.send({ ...input, html: null });
          return { ok: sent.accepted, error: sent.error };
        },
        onLog: (msg, meta) => log.info(msg, meta),
        allowSuspend: true,
        resume: resumeWith,
      });
      let result = await run(resume);
      const taskOrder = Number(row.task_order);
      // Manual tasks that do not wait are created and the automation continues immediately.
      while (result.suspended?.kind === 'task' && !result.suspended.task.wait) {
        await createInFlowManualTask(client, tenantId, requestId, requestTaskId, taskOrder, result.suspended.task);
        result = await run({ checkpoint: result.suspended.checkpoint, outcome: 'completed' });
      }

      if (result.suspended?.kind === 'task') {
        const manualTaskId = await createInFlowManualTask(
          client,
          tenantId,
          requestId,
          requestTaskId,
          taskOrder,
          result.suspended.task,
        );
        await client.query(
          `UPDATE request_tasks SET automation_checkpoint = $1::jsonb, notes = $2 WHERE id = $3`,
          [JSON.stringify(result.suspended.checkpoint), truncateNotes(JSON.stringify(result.notes)), requestTaskId],
        );
        return { ok: true, message: result.message, suspended: { approvalTaskId: manualTaskId, taskKind: 'manual' } };
      }

      if (result.suspended) {
        const approvalTaskId = await createInFlowApprovalTask(
          client,
          tenantId,
          requestId,
          requestTaskId,
          taskOrder,
          request,
          result.suspended.approval,
        );
        await client.query(
          `UPDATE request_tasks SET automation_checkpoint = $1::jsonb, notes = $2 WHERE id = $3`,
          [JSON.stringify(result.suspended.checkpoint), truncateNotes(JSON.stringify(result.notes)), requestTaskId],
        );
        return { ok: true, message: result.message, suspended: { approvalTaskId, taskKind: 'approval' } };
      }

      await client.query(
        `UPDATE request_tasks
         SET status = $1, completed_at = now(), completed_by = NULL, notes = $2, automation_checkpoint = NULL
         WHERE id = $3`,
        [result.ok ? 'completed' : 'failed', truncateNotes(JSON.stringify(result.notes)), requestTaskId],
      );

      return {
        ok: result.ok,
        message: result.message,
        rejectRequest: result.rejectRequest,
        skipTaskOrders: result.skipTaskOrders,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await client.query(
        `UPDATE request_tasks
         SET status = 'failed', completed_at = now(), completed_by = NULL, notes = $1
         WHERE id = $2`,
        [truncateNotes(`Automated execution failed: ${message}`), requestTaskId],
      );
      // Infra/config failures should not leave requests hanging in progress.
      return { ok: false, message, rejectRequest: true };
    }
  });
}

export const __test__ = {
  createInFlowManualTask,
  evaluateAdvancedCondition,
  toHttpActivityState,
};
