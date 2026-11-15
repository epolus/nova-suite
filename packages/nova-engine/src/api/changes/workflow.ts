/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Change workflow (transition / approval) services ───
// Plain-argument services (PoolClient + args). No Request/Response.
// Notification enqueue side effects are fired by the route.
import type { PoolClient } from 'pg';
import { AppError, NotFound } from '../../middleware/errorHandler';
import { normalizeChangePir } from '../../domain/change-pir';
import { standardChangeSuccessRate } from '../../domain/standard-change-outcome';
import { assertRequiredChecklistsComplete } from '../../domain/checklists';
import {
  writeChangeAuditDiff,
  writeChangeStateJournal,
} from '../../domain/change-collaboration';
import { canWorkOnChange } from './permissions';
import { refreshChangeConflicts } from './conflicts';
import type { ChangeActor, ChangeTransitionAction } from './types';

export async function refreshStandardChangeOutcome(
  client: PoolClient,
  standardChangeId: string,
): Promise<void> {
  const stats = await client.query(
    `SELECT count(*)::int AS closed_count,
            count(*) FILTER (WHERE success IS TRUE)::int AS success_count
     FROM changes
     WHERE tenant_id = current_tenant_id()
       AND standard_change_id = $1
       AND status = 'closed'
       AND success IS NOT NULL`,
    [standardChangeId],
  );
  const closedCount = Number(stats.rows[0]?.closed_count || 0);
  const successCount = Number(stats.rows[0]?.success_count || 0);
  await client.query(
    `UPDATE standard_changes
     SET usage_count = $2,
         success_rate = $3
     WHERE tenant_id = current_tenant_id()
       AND id = $1`,
    [standardChangeId, closedCount, standardChangeSuccessRate(successCount, closedCount)],
  );
}

export function normalizeStatusAndStage(action: string): { stage: string; status: string } {
  switch (action) {
    case 'submit_assessment':
      return { stage: 'assessment', status: 'assessment' };
    case 'request_approval':
      return { stage: 'approval', status: 'pending_approval' };
    case 'approve':
      return { stage: 'planning', status: 'approved' };
    case 'reject':
      return { stage: 'approval', status: 'rejected' };
    case 'start_planning':
      return { stage: 'planning', status: 'planning' };
    case 'schedule':
      return { stage: 'planning', status: 'scheduled' };
    case 'start_implementation':
      return { stage: 'implementation', status: 'implementing' };
    case 'mark_implemented':
      return { stage: 'implementation', status: 'implemented' };
    case 'start_review':
      return { stage: 'review', status: 'reviewing' };
    case 'close':
      return { stage: 'review', status: 'closed' };
    case 'cancel':
      return { stage: 'request', status: 'cancelled' };
    default:
      return { stage: 'request', status: 'draft' };
  }
}

export function computeAllowedChangeActions(
  change: any,
  pendingApprovals: number,
  hasCiContext: boolean,
): ChangeTransitionAction[] {
  const actions: ChangeTransitionAction[] = [];
  const status = String(change.status || '');
  const hasSchedule = Boolean(change.scheduled_start && change.scheduled_end);
  const hasServiceOrCiContext = hasCiContext || Boolean(change.service_id);

  if (status === 'draft') actions.push('submit_assessment');
  if (
    status === 'assessment'
    && !!change.implementation_plan
    && hasSchedule
    && hasServiceOrCiContext
  ) {
    actions.push('request_approval');
  }
  if (status === 'approved') actions.push('start_planning');
  if (status === 'planning') actions.push('schedule');
  if (status === 'scheduled') actions.push('start_implementation');
  if (status === 'implementing') actions.push('mark_implemented');
  if (status === 'implemented') actions.push('start_review');
  if (status === 'reviewing') actions.push('close');
  if (status === 'pending_approval') {
    actions.push('reject');
    if (pendingApprovals === 0 && hasSchedule) actions.push('approve');
  }
  if (!['closed', 'cancelled'].includes(status)) actions.push('cancel');

  return actions;
}

/** When a change closes, propagate the outcome to the linked incident / problem. */
export async function syncRelatedRecords(client: PoolClient, change: any): Promise<void> {
  if (change.status !== 'closed') return;
  if (change.related_incident_id) {
    await client.query(
      `UPDATE incidents
       SET status = CASE WHEN $2 = true THEN 'resolved'::incident_status_enum ELSE status END,
           resolution_notes = COALESCE(resolution_notes, '') || E'\nLinked change ' || $1 || ' closed.',
           updated_at = now()
       WHERE tenant_id = current_tenant_id()
         AND id = $3`,
      [change.number, change.success, change.related_incident_id],
    );
  }
  if (change.related_problem_id && change.success === true) {
    await client.query(
      `UPDATE problems
       SET status = 'resolved'::problem_status_enum,
           resolution_notes = COALESCE(resolution_notes, '') || E'\nResolved via change ' || $1,
           resolved_at = COALESCE(resolved_at, now()),
           updated_at = now()
       WHERE tenant_id = current_tenant_id()
         AND id = $2
         AND status <> 'closed'::problem_status_enum`,
      [change.number, change.related_problem_id],
    );
  }
}

// ─── POST /api/changes/:id/transition ───

export interface ChangeTransitionBody {
  action: string;
  notes?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  override_blocking_conflicts?: boolean;
  success?: boolean;
  failure_category?: string | null;
  planned_downtime_minutes?: number | null;
  actual_downtime_minutes?: number | null;
  review_notes?: string | null;
}

export async function transitionChange(
  client: PoolClient,
  actor: ChangeActor,
  changeId: string,
  body: ChangeTransitionBody,
): Promise<Record<string, any>> {
  const changeRes = await client.query(
    `SELECT c.*, ct.auto_approve, ct.approval_config, ct.name AS change_type_name
       FROM changes c
       JOIN change_types ct ON ct.id = c.change_type_id
       WHERE c.tenant_id = current_tenant_id()
         AND c.id = $1`,
    [changeId],
  );
  if (changeRes.rows.length === 0) throw NotFound('Change not found');
  const change = changeRes.rows[0];
  const canWork = await canWorkOnChange(client, actor, change);
  if (!canWork) throw new AppError(403, 'Insufficient permissions');

  const { action, notes, scheduled_start, scheduled_end, override_blocking_conflicts } = body;
  const pendingApprovalsRes = await client.query(
    `SELECT count(*) AS c
       FROM change_approvals
       WHERE tenant_id = current_tenant_id()
         AND change_id = $1
         AND status = 'pending'`,
    [change.id],
  );
  const pendingApprovals = Number(pendingApprovalsRes.rows[0]?.c || 0);
  const changeCiRes = await client.query(
    `SELECT count(*) AS c
       FROM change_cis
       WHERE tenant_id = current_tenant_id()
         AND change_id = $1`,
    [change.id],
  );
  const hasCiContext = Number(changeCiRes.rows[0]?.c || 0) > 0;
  const allowedActions = computeAllowedChangeActions(change, pendingApprovals, hasCiContext);
  if (!allowedActions.includes(action as ChangeTransitionAction)) {
    throw new AppError(400, `Action "${action}" is not allowed for current change status`);
  }
  if (action === 'request_approval' && !change.implementation_plan) {
    throw new AppError(400, 'Implementation plan is required before requesting approval');
  }
  if (action === 'request_approval' && (!change.scheduled_start || !change.scheduled_end)) {
    throw new AppError(400, 'scheduled_start and scheduled_end are required before requesting approval');
  }
  if (action === 'request_approval' && !hasCiContext && !change.service_id) {
    throw new AppError(400, 'Service / CI context is required before requesting approval');
  }
  if (action === 'schedule' && (!scheduled_start || !scheduled_end)) {
    throw new AppError(400, 'scheduled_start and scheduled_end are required to schedule');
  }
  if (action === 'mark_implemented') {
    await assertRequiredChecklistsComplete(client, 'change', String(change.id));
  }
  if (action === 'approve') {
    if (!change.scheduled_start || !change.scheduled_end) {
      throw new AppError(400, 'scheduled_start and scheduled_end are required before approval');
    }
    if (pendingApprovals > 0) {
      throw new AppError(400, 'All required approvals must be completed before approving the change');
    }
  }
  if (action === 'schedule' || action === 'request_approval') {
    const blocking = await refreshChangeConflicts(
      client,
      changeId,
      action === 'schedule'
        ? { start: scheduled_start, end: scheduled_end }
        : undefined,
    );
    const emergency = String(change.change_type_name || '').toLowerCase() === 'emergency';
    const allowOverride = Boolean(override_blocking_conflicts)
      && emergency
      && actor.canOverrideBlockingConflicts;
    if (blocking > 0 && !allowOverride) {
      throw new AppError(
        409,
        `Blocking schedule conflicts (${blocking}) must be resolved before this transition. A change manager can override them on an emergency change.`,
        'BLOCKING_CONFLICT',
      );
    }
  }
  if (action === 'submit_assessment') {
    await client.query(
      `DELETE FROM change_approvals
         WHERE tenant_id = current_tenant_id()
           AND change_id = $1`,
      [change.id],
    );
  }
  if (action === 'request_approval') {
    const existingApprovals = await client.query(
      `SELECT count(*) AS c
         FROM change_approvals
         WHERE tenant_id = current_tenant_id()
           AND change_id = $1`,
      [change.id],
    );
    if (Number(existingApprovals.rows[0]?.c || 0) === 0) {
      const typeRes = await client.query(
        `SELECT requires_cab_approval, requires_manager_approval, approval_config
           FROM change_types
           WHERE tenant_id = current_tenant_id()
             AND id = $1`,
        [change.change_type_id],
      );
      const changeType = typeRes.rows[0];
      const requiredApprovals = Number(changeType?.approval_config?.required_approvals || 1);
      const approvalRows: Array<{ type: string; userId: string | null }> = [];
      if (changeType?.requires_manager_approval) {
        const requesterManager = await client.query(
          `SELECT manager_id
             FROM users
             WHERE tenant_id = current_tenant_id()
               AND id = $1`,
          [change.requested_by],
        );
        approvalRows.push({ type: 'manager', userId: requesterManager.rows[0]?.manager_id || null });
      }
      if (changeType?.requires_cab_approval) {
        approvalRows.push({ type: 'cab', userId: null });
      }
      while (approvalRows.length < requiredApprovals) {
        approvalRows.push({ type: 'technical', userId: null });
      }
      for (const a of approvalRows) {
        await client.query(
          `INSERT INTO change_approvals
             (tenant_id, change_id, approval_type, approver_user_id, approver_group_id)
             VALUES (current_tenant_id(), $1, $2, $3, $4)`,
          [change.id, a.type, a.userId, change.assignment_group_id || null],
        );
      }
    }
  }

  // PIR close path
  if (action === 'close') {
    let pir;
    try {
      pir = normalizeChangePir({
        success: body.success !== undefined ? body.success : change.success,
        failureCategory: body.failure_category !== undefined ? body.failure_category : change.failure_category,
        plannedDowntimeMinutes: body.planned_downtime_minutes !== undefined
          ? body.planned_downtime_minutes
          : change.planned_downtime_minutes,
        actualDowntimeMinutes: body.actual_downtime_minutes !== undefined
          ? body.actual_downtime_minutes
          : change.actual_downtime_minutes,
      });
    } catch (err) {
      throw new AppError(400, err instanceof Error ? err.message : 'Post-implementation review is incomplete');
    }
    const reviewNotes = body.review_notes !== undefined ? body.review_notes : change.review_notes;
    await client.query(
      `UPDATE changes
         SET success = $1,
             failure_category = $2,
             planned_downtime_minutes = $3,
             actual_downtime_minutes = $4,
             review_notes = $5
         WHERE tenant_id = current_tenant_id()
           AND id = $6`,
      [
        pir.success,
        pir.failureCategory,
        pir.plannedDowntimeMinutes,
        pir.actualDowntimeMinutes,
        reviewNotes || null,
        changeId,
      ],
    );
  }

  const state = normalizeStatusAndStage(action);
  await client.query(
    `UPDATE changes
       SET stage = $1::change_stage_enum,
           status = $2::change_status_enum,
           scheduled_start = COALESCE($3::timestamptz, scheduled_start),
           scheduled_end = COALESCE($4::timestamptz, scheduled_end),
           actual_start = CASE WHEN $2 = 'implementing'::change_status_enum THEN COALESCE(actual_start, now()) ELSE actual_start END,
           actual_end = CASE WHEN $2 = 'implemented'::change_status_enum OR $2 = 'closed'::change_status_enum THEN COALESCE(actual_end, now()) ELSE actual_end END,
           implementation_notes = CASE WHEN $5::text IS NULL OR $5::text = '' THEN implementation_notes ELSE COALESCE(implementation_notes, '') || E'\n' || $5::text END
       WHERE tenant_id = current_tenant_id()
         AND id = $6`,
    [state.stage, state.status, scheduled_start || null, scheduled_end || null, notes || null, changeId],
  );
  await refreshChangeConflicts(client, changeId);
  const updated = await client.query(
    `SELECT *
       FROM changes
       WHERE tenant_id = current_tenant_id()
         AND id = $1`,
    [changeId],
  );
  await writeChangeAuditDiff(
    client,
    changeId,
    actor.id,
    change as Record<string, unknown>,
    (updated.rows[0] || {}) as Record<string, unknown>,
  );
  await writeChangeStateJournal(client, {
    changeId,
    authorId: actor.id,
    before: change,
    after: updated.rows[0] || {},
    notes: notes || null,
  });
  await syncRelatedRecords(client, updated.rows[0]);
  if (action === 'close' && updated.rows[0]?.standard_change_id) {
    await refreshStandardChangeOutcome(client, String(updated.rows[0].standard_change_id));
  }
  return updated.rows[0];
}

// ─── POST /api/changes/:id/approvals/:approvalId/decision ───

export async function decideApproval(
  client: PoolClient,
  actor: ChangeActor,
  changeId: string,
  approvalId: string,
  body: { decision: string; notes?: string | null },
): Promise<void> {
  const approvalRes = await client.query(
    `SELECT *
       FROM change_approvals
       WHERE tenant_id = current_tenant_id()
         AND change_id = $1
         AND id = $2`,
    [changeId, approvalId],
  );
  if (approvalRes.rows.length === 0) throw NotFound('Approval not found');
  const approval = approvalRes.rows[0];

  const isDirectApprover = approval.approver_user_id && approval.approver_user_id === actor.id;
  let isGroupApprover = false;
  if (approval.approver_group_id) {
    const m = await client.query(
      `SELECT 1 FROM assignment_group_members
         WHERE tenant_id = current_tenant_id()
           AND group_id = $1
           AND user_id = $2
         LIMIT 1`,
      [approval.approver_group_id, actor.id],
    );
    isGroupApprover = m.rows.length > 0;
  }
  if (!actor.isAdmin && !isDirectApprover && !isGroupApprover && !actor.hasChangeRole) {
    throw new AppError(403, 'Insufficient permissions');
  }

  const { decision, notes } = body;
  if (decision === 'approved' || decision === 'waived') {
    const pendingAfterDecision = await client.query(
      `SELECT count(*) AS c
         FROM change_approvals
         WHERE tenant_id = current_tenant_id()
           AND change_id = $1
           AND status = 'pending'
           AND id <> $2`,
      [changeId, approvalId],
    );
    const remainingPending = Number(pendingAfterDecision.rows[0]?.c || 0);
    if (remainingPending === 0) {
      const changeDates = await client.query(
        `SELECT scheduled_start, scheduled_end
           FROM changes
           WHERE tenant_id = current_tenant_id()
             AND id = $1`,
        [changeId],
      );
      const readyToApprove = changeDates.rows[0];
      if (!readyToApprove?.scheduled_start || !readyToApprove?.scheduled_end) {
        throw new AppError(400, 'scheduled_start and scheduled_end are required before approval');
      }
    }
  }
  await client.query(
    `UPDATE change_approvals
       SET status = $1::approval_status_enum,
           decided_by = $2,
           decision_notes = $3,
           decided_at = now()
       WHERE tenant_id = current_tenant_id()
         AND id = $4`,
    [decision, actor.id, notes || null, approval.id],
  );

  const beforeChange = await client.query(
    `SELECT * FROM changes WHERE tenant_id = current_tenant_id() AND id = $1`,
    [changeId],
  );
  if (decision === 'rejected') {
    await client.query(
      `UPDATE changes
         SET stage = 'approval'::change_stage_enum,
             status = 'rejected'::change_status_enum
         WHERE tenant_id = current_tenant_id()
           AND id = $1`,
      [changeId],
    );
  } else {
    const pending = await client.query(
      `SELECT count(*) AS c
         FROM change_approvals
         WHERE tenant_id = current_tenant_id()
           AND change_id = $1
           AND status = 'pending'`,
      [changeId],
    );
    if (Number(pending.rows[0]?.c || 0) === 0) {
      await client.query(
        `UPDATE changes
           SET stage = 'planning'::change_stage_enum,
               status = 'approved'::change_status_enum
           WHERE tenant_id = current_tenant_id()
             AND id = $1`,
        [changeId],
      );
    }
  }
  const afterChange = await client.query(
    `SELECT * FROM changes WHERE tenant_id = current_tenant_id() AND id = $1`,
    [changeId],
  );
  if (beforeChange.rows[0] && afterChange.rows[0]) {
    await writeChangeAuditDiff(
      client,
      changeId,
      actor.id,
      beforeChange.rows[0] as Record<string, unknown>,
      afterChange.rows[0] as Record<string, unknown>,
    );
    await writeChangeStateJournal(client, {
      changeId,
      authorId: actor.id,
      before: beforeChange.rows[0],
      after: afterChange.rows[0],
      notes: notes || null,
    });
  }
}
