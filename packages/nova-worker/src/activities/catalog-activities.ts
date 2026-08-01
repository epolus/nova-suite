/* SPDX-License-Identifier: AGPL-3.0-only */
import { log } from '@temporalio/activity';
import { withTenantContext } from '../db';
import { dispatchConfiguredNotifications } from './notification-activities';

export interface TaskDefinition {
  id: string | null;
  name: string;
  description: string | null;
  instructions: string | null;
  taskType: string;
  taskOrder: number;
  assignedGroupId: string | null;
  slaHours: number | null;
  automationConfig: unknown;
}

function getApprovalMode(task: TaskDefinition): 'group_members' | 'group_manager' {
  const raw = task.automationConfig;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'group_members';
  const mode = (raw as { approval_mode?: unknown }).approval_mode;
  return mode === 'group_manager' ? 'group_manager' : 'group_members';
}

function automatedRunsWithoutUserSignal(task: TaskDefinition): boolean {
  if (task.taskType !== 'automated') return false;
  const raw = task.automationConfig;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const kind = (raw as { kind?: unknown }).kind;
  return kind === 'state_machine';
}

export async function getTaskDefinitions(
  serviceItemId: string,
  tenantId: string,
): Promise<TaskDefinition[]> {
  log.info('Loading task definitions', { serviceItemId });
  return withTenantContext(tenantId, async (client) => {
    const itemResult = await client.query(
      `SELECT approval_required FROM service_items WHERE id = $1`,
      [serviceItemId],
    );
    const approvalRequired = Boolean(itemResult.rows[0]?.approval_required);

    const result = await client.query(
      `SELECT id, name, description, instructions, task_type, task_order, assigned_group_id, sla_hours, automation_config
       FROM catalog_tasks
       WHERE service_item_id = $1 AND is_active = true
       ORDER BY task_order, created_at`,
      [serviceItemId],
    );
    const tasks: TaskDefinition[] = result.rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      name: r.name as string,
      description: r.description as string | null,
      instructions: r.instructions as string | null,
      taskType: r.task_type as string,
      taskOrder: r.task_order as number,
      assignedGroupId: r.assigned_group_id as string | null,
      slaHours: r.sla_hours as number | null,
      automationConfig: r.automation_config ?? {},
    }));

    const hasApprovalTask = tasks.some((t) => t.taskType === 'approval');
    if (approvalRequired && !hasApprovalTask && tasks.length > 0) {
      // Enforce approval gate for workflow-based items that require approval.
      // No assigned group means manager approval (assignee resolved in createRequestTasks; skipped if no manager).
      tasks.unshift({
        id: null,
        name: 'Manager Approval',
        description: 'Approval required before fulfillment tasks can proceed',
        instructions: 'Please review and approve or reject this request.',
        taskType: 'approval',
        taskOrder: 0,
        assignedGroupId: null,
        slaHours: null,
        automationConfig: {},
      });
    }

    return tasks;
  });
}

export async function createRequestTasks(
  requestId: string,
  tenantId: string,
  tasks: TaskDefinition[],
): Promise<{ id: string; taskOrder: number; taskType: string; requiresUserCompletion: boolean }[]> {
  log.info('Creating request tasks', { requestId, count: tasks.length });
  return withTenantContext(tenantId, async (client) => {
    // Manager approval is represented by approval tasks without an assigned group.
    // Resolve the request subject's manager (requested_for when set, otherwise requester).
    const requestResult = await client.query(
      `SELECT u.manager_id, r.form_data
       FROM requests r
       LEFT JOIN users u ON u.id = COALESCE(r.requested_for, r.requester_id)
       WHERE r.id = $1`,
      [requestId],
    );
    const subjectManagerId = requestResult.rows[0]?.manager_id as string | null | undefined;
    const requestFormData = (requestResult.rows[0]?.form_data as Record<string, unknown> | null | undefined) || {};
    const groupManagerCache = new Map<string, string | null>();

    const created: { id: string; taskOrder: number; taskType: string; requiresUserCompletion: boolean }[] = [];
    for (const task of tasks) {
      const seqResult = await client.query("SELECT nextval('task_number_seq')");
      const number = `TASK${seqResult.rows[0].nextval.toString().padStart(7, '0')}`;
      const isManagerApproval = task.taskType === 'approval' && !task.assignedGroupId;
      const approvalMode = task.taskType === 'approval' ? getApprovalMode(task) : 'group_members';
      let assignedTo: string | null = isManagerApproval ? subjectManagerId || null : null;
      let assignedGroupId = task.assignedGroupId;
      if (task.taskType === 'approval' && task.assignedGroupId && approvalMode === 'group_manager') {
        const requestedGroupId = typeof requestFormData.target_group_id === 'string'
          ? requestFormData.target_group_id.trim()
          : '';
        const requestedGroupName = typeof requestFormData.target_group_name === 'string'
          ? requestFormData.target_group_name.trim()
          : '';
        const managerLookupKey = requestedGroupId || requestedGroupName || task.assignedGroupId;
        if (!groupManagerCache.has(managerLookupKey)) {
          const managerResult = await client.query(
            `SELECT manager_id
             FROM assignment_groups
             WHERE tenant_id = $1
               AND (
                 id = $2
                 OR lower(name) = lower($3)
               )
             ORDER BY CASE
               WHEN id = $2 THEN 0
               WHEN lower(name) = lower($3) THEN 1
               ELSE 2
             END
             LIMIT 1`,
            [tenantId, requestedGroupId || task.assignedGroupId, requestedGroupName || ''],
          );
          groupManagerCache.set(
            managerLookupKey,
            (managerResult.rows[0]?.manager_id as string | null | undefined) ?? null,
          );
        }
        assignedTo = groupManagerCache.get(managerLookupKey) || null;
        // Manager-only gate: use explicit assignee, not "any group member".
        assignedGroupId = null;
      }
      const skipManagerApproval = isManagerApproval && !assignedTo;
      const skipGroupManagerApproval =
        task.taskType === 'approval' && task.assignedGroupId && approvalMode === 'group_manager' && !assignedTo;
      const skipApproval = skipManagerApproval || skipGroupManagerApproval;
      const status = skipApproval ? 'skipped' : 'pending';
      const completedAt = skipApproval ? new Date() : null;
      const notes = skipApproval
        ? (
          skipManagerApproval
            ? 'No manager for the request subject; manager approval was skipped.'
            : 'No manager defined for the selected approval group; manager approval was skipped.'
        )
        : null;
      const result = await client.query(
        `INSERT INTO request_tasks (
          tenant_id, number, request_id, catalog_task_id, task_order, name, description, instructions, task_type, assigned_to, assigned_group_id, status, completed_at, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
        [
          tenantId,
          number,
          requestId,
          task.id,
          task.taskOrder,
          task.name,
          task.description,
          task.instructions,
          task.taskType,
          assignedTo,
          assignedGroupId,
          status,
          completedAt,
          notes,
        ],
      );
      const runsAuto = status === 'pending' && automatedRunsWithoutUserSignal(task);
      created.push({
        id: result.rows[0].id as string,
        taskOrder: task.taskOrder,
        taskType: task.taskType,
        requiresUserCompletion: status === 'pending' && !runsAuto,
      });
    }
    return created;
  });
}

export async function activateTaskGroup(
  requestId: string,
  tenantId: string,
  taskOrder: number,
): Promise<string[]> {
  log.info('Activating task group', { requestId, taskOrder });
  return withTenantContext(tenantId, async (client) => {
    const reqInfo = await client.query(
      `SELECT number FROM requests WHERE id = $1`,
      [requestId],
    );
    const requestNumber = (reqInfo.rows[0]?.number as string | undefined) ?? 'Request';

    const result = await client.query(
      `UPDATE request_tasks SET status = 'in_progress', started_at = now()
       WHERE request_id = $1 AND task_order = $2 AND status = 'pending'
       RETURNING id, task_type, name, assigned_to`,
      [requestId, taskOrder],
    );

    for (const row of result.rows as Array<Record<string, unknown>>) {
      const assignedTo = row.assigned_to as string | null;
      const taskType = row.task_type as string | null;
      if (!assignedTo || taskType !== 'approval') continue;
      const taskName = (row.name as string | null) || 'Approval';
      await client.query(
        `INSERT INTO notifications (
           tenant_id, user_id, type, title, body, entity_type, entity_id
         ) VALUES ($1, $2, 'assignment', $3, $4, 'request', $5)`,
        [
          tenantId,
          assignedTo,
          `${requestNumber}: approval required`,
          `Please review task "${taskName}".`,
          requestId,
        ],
      );
    }
    return result.rows.map((r: Record<string, unknown>) => r.id as string);
  });
}

export async function completeRequestTask(
  taskId: string,
  tenantId: string,
  status: string,
  outcome: string | null,
  completedBy: string | null,
  notes: string | null,
): Promise<void> {
  log.info('Completing request task', { taskId, status, outcome });
  await withTenantContext(tenantId, async (client) => {
    await client.query(
      `UPDATE request_tasks SET status = $1, outcome = $2, completed_by = $3, completed_at = now(), notes = $4
       WHERE id = $5`,
      [status, outcome, completedBy, notes, taskId],
    );
  });
}

export async function skipRemainingTasks(
  requestId: string,
  tenantId: string,
): Promise<void> {
  log.info('Skipping remaining tasks', { requestId });
  await withTenantContext(tenantId, async (client) => {
    await client.query(
      `UPDATE request_tasks SET status = 'skipped' WHERE request_id = $1 AND status IN ('pending', 'in_progress')`,
      [requestId],
    );
  });
}

export async function updateRequestStatus(
  requestId: string,
  tenantId: string,
  status: string,
): Promise<void> {
  log.info('Updating request status', { requestId, status });
  const transition = await withTenantContext(tenantId, async (client) => {
    const result = await client.query<{
      previous_status: string | null;
      current_status: string | null;
    }>(
      `WITH previous AS (
         SELECT status AS previous_status
         FROM requests
         WHERE id = $2
       ),
       updated AS (
         UPDATE requests
         SET status = $1, updated_at = now()
         WHERE id = $2
         RETURNING status AS current_status
       )
       SELECT previous.previous_status, updated.current_status
       FROM previous
       JOIN updated ON true`,
      [status, requestId],
    );
    return result.rows[0] || null;
  });

  if (!transition) return;
  if (transition.previous_status === transition.current_status) return;

  if (status === 'fulfilled' || status === 'cancelled') {
    await dispatchConfiguredNotifications({
      tenantId,
      entityType: 'request',
      triggerKey: `request.${status}`,
      entityId: requestId,
      actorUserId: null,
    });
  }
}

export async function getPendingTaskCount(
  requestId: string,
  tenantId: string,
  taskOrder: number,
): Promise<number> {
  return withTenantContext(tenantId, async (client) => {
    const result = await client.query(
      `SELECT count(*) FROM request_tasks WHERE request_id = $1 AND task_order = $2 AND status IN ('pending', 'in_progress')`,
      [requestId, taskOrder],
    );
    return parseInt(result.rows[0].count as string, 10);
  });
}

/** Task IDs that still need a taskCompleted signal (matches pending/in_progress after automation/skip). */
export async function getAwaitingHumanTaskIds(
  requestId: string,
  tenantId: string,
  taskOrder: number,
): Promise<string[]> {
  return withTenantContext(tenantId, async (client) => {
    const result = await client.query(
      `SELECT id FROM request_tasks
       WHERE request_id = $1 AND task_order = $2 AND status IN ('pending', 'in_progress')
       ORDER BY created_at ASC`,
      [requestId, taskOrder],
    );
    return result.rows.map((r: { id: string }) => r.id);
  });
}
