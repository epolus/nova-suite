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
  /** Set when resuming after an in-flow approval decided by a human. */
  resumeOutcome?: 'approved' | 'rejected';
}

export interface ExecuteAutomatedCatalogTaskResult {
  ok: boolean;
  message?: string;
  rejectRequest?: boolean;
  skipTaskOrders?: number[];
  /** The automation is paused until this approval request_task is decided. */
  suspended?: { approvalTaskId: string };
}

type QueryClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveApprovalAssignee(
  client: QueryClient,
  tenantId: string,
  request: Record<string, unknown>,
  approval: AutomationSuspension['approval'],
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
  approval: AutomationSuspension['approval'],
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
      `SELECT id, number, status, form_data, delivery_info, requester_id, requested_for FROM requests WHERE id = $1`,
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
        `SELECT id FROM request_tasks
         WHERE parent_task_id = $1 AND task_type = 'approval' AND status IN ('pending', 'in_progress')
         ORDER BY created_at DESC LIMIT 1`,
        [requestTaskId],
      );
      if (pending.rows[0]) {
        return { ok: true, message: 'Awaiting in-flow approval', suspended: { approvalTaskId: pending.rows[0].id as string } };
      }
    }
    let resume: { checkpoint: AutomationCheckpoint; outcome: 'approved' | 'rejected' } | undefined;
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
      const result = await executeAutomationGraph({
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
        resume,
      });

      if (result.suspended) {
        const approvalTaskId = await createInFlowApprovalTask(
          client,
          tenantId,
          requestId,
          requestTaskId,
          Number(row.task_order),
          request,
          result.suspended.approval,
        );
        await client.query(
          `UPDATE request_tasks SET automation_checkpoint = $1::jsonb, notes = $2 WHERE id = $3`,
          [JSON.stringify(result.suspended.checkpoint), truncateNotes(JSON.stringify(result.notes)), requestTaskId],
        );
        return { ok: true, message: result.message, suspended: { approvalTaskId } };
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
  evaluateAdvancedCondition,
  toHttpActivityState,
};
