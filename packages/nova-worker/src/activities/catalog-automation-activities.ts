/* SPDX-License-Identifier: AGPL-3.0-only */
import { log } from '@temporalio/activity';
import {
  AUTOMATION_SCHEMA_VERSION,
  collectCredSlugsFromAutomation,
  evaluateAdvancedCondition,
  executeAutomationGraph,
  parseAutomationConfig,
  parseFulfillmentModelConfig,
  renderFulfillmentTemplate,
  resolveCredentialTemplateValues,
  toHttpActivityState,
  type AutomationCheckpoint,
  type AutomationResumeOutcome,
  type AutomationSuspension,
  type FulfillmentModelConfig,
  type FulfillmentTemplateContext,
} from '@nova-suite/shared';
import type { PoolClient } from 'pg';
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

async function findTenantRow(
  client: QueryClient,
  table: 'users' | 'assignment_groups',
  columns: string,
  tenantId: string,
  raw: string,
  match: string,
): Promise<Record<string, unknown> | undefined> {
  const id = UUID_RE.test(raw) ? raw : null;
  const r = await client.query(
    `SELECT ${columns} FROM ${table}
     WHERE tenant_id = $1 AND (($2::uuid IS NOT NULL AND id = $2::uuid) OR ${match})
     LIMIT 1`,
    [tenantId, id, raw],
  );
  return r.rows[0];
}

async function resolveApprovalAssignee(
  client: QueryClient,
  tenantId: string,
  request: Record<string, unknown>,
  approval: ApprovalSuspension['approval'],
): Promise<{ assignedTo: string | null; assignedGroupId: string | null; note: string | null }> {
  const approver = approval.approver.trim();
  if (approval.approverType === 'user') {
    const row = await findTenantRow(
      client, 'users', 'id', tenantId, approver,
      'lower(email) = lower($3) OR lower(user_id) = lower($3)',
    );
    const id = (row?.id as string | undefined) ?? null;
    return { assignedTo: id, assignedGroupId: null, note: id ? null : `Approver user "${approver}" not found.` };
  }
  if (approval.approverType === 'group' || approval.approverType === 'group_manager') {
    const row = await findTenantRow(
      client, 'assignment_groups', 'id, manager_id', tenantId, approver, 'lower(name) = lower($3)',
    );
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
  if (approval.approverType === 'department_manager') {
    const r = await client.query(
      `SELECT d.manager_id
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.id = $1 AND u.tenant_id = $2`,
      [subjectId, tenantId],
    );
    const managerId = (r.rows[0]?.manager_id as string | null | undefined) ?? null;
    return {
      assignedTo: managerId,
      assignedGroupId: null,
      note: managerId ? null : 'Request subject has no department manager.',
    };
  }
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
    const row = await findTenantRow(client, 'assignment_groups', 'id', tenantId, group, 'lower(name) = lower($3)');
    assignedGroupId = (row?.id as string | undefined) ?? null;
    if (!assignedGroupId) notes.push(`Assignment group "${group}" not found.`);
  }
  let assignedTo: string | null = null;
  const assignee = task.assignee.trim();
  if (assignee) {
    const row = await findTenantRow(client, 'users', 'id', tenantId, assignee, 'lower(email) = lower($3)');
    assignedTo = (row?.id as string | undefined) ?? null;
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

async function storeSuspensionCheckpoint(
  client: QueryClient,
  requestTaskId: string,
  checkpoint: unknown,
  notes: unknown,
): Promise<void> {
  await client.query(
    `UPDATE request_tasks SET automation_checkpoint = $1::jsonb, notes = $2 WHERE id = $3`,
    [JSON.stringify(checkpoint), truncateNotes(JSON.stringify(notes)), requestTaskId],
  );
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

function pgErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) return String((err as { code: unknown }).code);
  return undefined;
}

async function provisionFulfillmentModel(
  client: PoolClient,
  tenantId: string,
  requestId: string,
  requestTaskId: string,
): Promise<ExecuteAutomatedCatalogTaskResult> {
  let committed = false;
  try {
    await client.query('BEGIN');
    const reqRes = await client.query(
      `SELECT r.number, r.form_data, r.requester_id, r.requested_for,
              r.provisioned_ci_id, r.provisioned_asset_id,
              si.name AS service_item_name, si.fulfillment_model_id
       FROM requests r
       JOIN service_items si ON si.id = r.service_item_id
       WHERE r.id = $1
       FOR UPDATE OF r`,
      [requestId],
    );
    if (reqRes.rows.length === 0) throw new Error('Request not found');
    const request = reqRes.rows[0] as Record<string, unknown>;
    const modelId = request.fulfillment_model_id ? String(request.fulfillment_model_id) : '';
    if (!modelId) throw new Error('Service item has no fulfillment model');

    const modelRes = await client.query(
      `SELECT config FROM fulfillment_models WHERE id = $1`,
      [modelId],
    );
    const model = parseFulfillmentModelConfig(modelRes.rows[0]?.config);
    if (!model) throw new Error('Fulfillment model config is invalid');

    if (!model.ci.enabled && !model.asset.enabled) {
      await client.query(
        `UPDATE request_tasks SET status = 'completed', completed_at = now(), notes = $1 WHERE id = $2`,
        ['Fulfillment model no longer creates a CI or asset.', requestTaskId],
      );
      await client.query('COMMIT');
      committed = true;
      return { ok: true, message: 'Nothing to provision' };
    }

    const subject = String(request.requested_for || request.requester_id);
    const formData = request.form_data && typeof request.form_data === 'object' && !Array.isArray(request.form_data)
      ? request.form_data as Record<string, unknown>
      : {};
    const templateContext: FulfillmentTemplateContext = {
      requestNumber: String(request.number),
      itemName: String(request.service_item_name || ''),
      formData,
    };
    const created = await createProvisionedRecords(client, tenantId, subject, model, templateContext, {
      ciId: request.provisioned_ci_id ? String(request.provisioned_ci_id) : null,
      assetId: request.provisioned_asset_id ? String(request.provisioned_asset_id) : null,
    });

    await client.query(
      `UPDATE requests
       SET provisioned_ci_id = $1, provisioned_asset_id = $2, updated_at = now()
       WHERE id = $3`,
      [created.ciId, created.assetId, requestId],
    );
    await client.query(
      `UPDATE request_tasks
       SET status = 'completed', completed_at = now(), notes = $1, automation_checkpoint = NULL
       WHERE id = $2`,
      [created.notes.join('. ').slice(0, 2000), requestTaskId],
    );
    await client.query('COMMIT');
    committed = true;
    return { ok: true, message: created.notes.join('. ') };
  } catch (err) {
    if (!committed) {
      try { await client.query('ROLLBACK'); } catch { /* connection may already be closed */ }
    }
    const message = err instanceof Error ? err.message : String(err);
    const friendly = pgErrorCode(err) === '23505' ? 'Asset tag already exists' : message;
    await client.query(
      `UPDATE request_tasks SET status = 'failed', completed_at = now(), notes = $1 WHERE id = $2`,
      [friendly.slice(0, 2000), requestTaskId],
    );
    return { ok: false, message: friendly, rejectRequest: true };
  }
}

async function createProvisionedRecords(
  client: PoolClient,
  tenantId: string,
  subjectUserId: string,
  model: FulfillmentModelConfig,
  templateContext: FulfillmentTemplateContext,
  existing: { ciId: string | null; assetId: string | null },
): Promise<{ ciId: string | null; assetId: string | null; notes: string[] }> {
  let ciId = existing.ciId;
  let assetId = existing.assetId;
  const notes: string[] = [];

  if (model.ci.enabled && !ciId) {
    if (!model.ci.class_id) throw new Error('CI class is required');
    const classRes = await client.query(
      `SELECT id FROM ci_classes WHERE id = $1 AND tenant_id = $2`,
      [model.ci.class_id, tenantId],
    );
    if (classRes.rows.length === 0) throw new Error('CI class not found');
    const name = renderFulfillmentTemplate(model.ci.name_template, templateContext);
    const displayName = renderFulfillmentTemplate(model.ci.display_name_template, templateContext) || name;
    if (!name) throw new Error('CI name template produced an empty name');
    if (name.length > 200 || displayName.length > 200) throw new Error('CI name template is too long');
    const ciResult = await client.query(
      `INSERT INTO configuration_items (
         tenant_id, class_id, name, display_name, status, environment,
         attributes, managed_by, assigned_to, notes
       ) VALUES (
         $1, $2, $3, $4, $5, 'production', $6::jsonb, $7, $7, $8
       ) RETURNING id, name, display_name, assigned_to`,
      [
        tenantId,
        model.ci.class_id,
        name,
        displayName,
        model.ci.status,
        JSON.stringify({
          request_number: templateContext.requestNumber,
          service_item: templateContext.itemName,
        }),
        subjectUserId,
        'Created by fulfillment model.',
      ],
    );
    const createdCi = ciResult.rows[0] as { id: string; name: string; display_name: string; assigned_to: string };
    ciId = String(createdCi.id);
    await client.query(
      `INSERT INTO ci_history (tenant_id, ci_id, changed_by, change_type, new_value)
       VALUES ($1, $2, $3, 'create', $4)`,
      [tenantId, ciId, subjectUserId, JSON.stringify(createdCi)],
    );
    notes.push(`Created CI ${displayName}`);
  } else if (ciId && model.ci.enabled) {
    notes.push('CI already provisioned');
  }

  if (model.asset.enabled && !assetId) {
    const name = renderFulfillmentTemplate(model.asset.name_template, templateContext);
    const assetTag = renderFulfillmentTemplate(model.asset.asset_tag_template, templateContext);
    if (!name) throw new Error('Asset name template produced an empty name');
    if (!assetTag) throw new Error('Asset tag template produced an empty tag');
    if (name.length > 200 || assetTag.length > 100) throw new Error('Asset template is too long');
    const assetResult = await client.query(
      `INSERT INTO assets (
         tenant_id, asset_tag, name, category, status, owner_user_id, linked_ci_id, notes
       ) VALUES (
         $1, $2, $3, $4, 'in_use', $5, $6, $7
       ) RETURNING id, asset_tag`,
      [
        tenantId,
        assetTag,
        name,
        model.asset.category || 'hardware',
        subjectUserId,
        ciId,
        'Created by fulfillment model.',
      ],
    );
    assetId = String(assetResult.rows[0].id);
    notes.push(`Created asset ${String(assetResult.rows[0].asset_tag)}`);
  } else if (assetId && model.asset.enabled) {
    notes.push('Asset already provisioned');
  }

  return { ciId, assetId, notes };
}

export async function executeAutomatedCatalogTask(
  input: ExecuteAutomatedCatalogTaskInput,
): Promise<ExecuteAutomatedCatalogTaskResult> {
  const { requestTaskId, requestId, tenantId, resumeOutcome } = input;
  log.info('executeAutomatedCatalogTask', { requestTaskId, requestId, resumeOutcome });

  return withTenantContext(tenantId, async (client) => {
    const taskRow = await client.query(
      `SELECT rt.id, rt.catalog_task_id, rt.task_order, rt.task_type, rt.status, rt.name, rt.automation_checkpoint,
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

    if (row.catalog_task_id == null) {
      return provisionFulfillmentModel(client, tenantId, requestId, requestTaskId);
    }

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
              r.notes, r.created_at,
              si.name AS service_item_name,
              requester.email AS requester_email,
              COALESCE(subject.email, requester.email) AS requested_for_email
       FROM requests r
       LEFT JOIN service_items si ON si.id = r.service_item_id
       LEFT JOIN users requester ON requester.id = r.requester_id
       LEFT JOIN users subject ON subject.id = r.requested_for
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
        await storeSuspensionCheckpoint(client, requestTaskId, result.suspended.checkpoint, result.notes);
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
        await storeSuspensionCheckpoint(client, requestTaskId, result.suspended.checkpoint, result.notes);
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
  resolveApprovalAssignee,
  evaluateAdvancedCondition,
  toHttpActivityState,
};
