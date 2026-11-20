/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Change create / get / update services ───
// Plain-argument services (PoolClient + args). No Request/Response.
// Notification enqueue side effects are fired by the route.
import type { PoolClient } from 'pg';
import { AppError, NotFound } from '../../middleware/errorHandler';
import { resolveSlaDueAt } from '../../domain/sla';
import { loadCustomFieldsMap, upsertCustomFields } from '../../domain/custom-fields';
import { assertRequiredChecklistsComplete } from '../../domain/checklists';
import {
  addChangeJournalEntry,
  writeChangeAuditDiff,
  writeChangeStateJournal,
} from '../../domain/change-collaboration';
import { canWorkOnChange, isChangeEnabledGroup } from './permissions';
import { refreshChangeConflicts } from './conflicts';
import { computeAllowedChangeActions, refreshStandardChangeOutcome } from './workflow';
import type { ChangeActor } from './types';

export function validateScheduleRange(start: unknown, end: unknown): void {
  if (!start || !end) return;
  const startMs = new Date(String(start)).getTime();
  const endMs = new Date(String(end)).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
  if (startMs > endMs) {
    throw new AppError(400, 'scheduled_end must be greater than or equal to scheduled_start');
  }
}

function asNullableString(value: unknown): string | null {
  if (value == null || value === '') return null;
  return String(value);
}

function asString(value: unknown, fallback = ''): string {
  if (value == null || value === '') return fallback;
  return String(value);
}

function asCustomFields(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

// ─── GET /api/changes/:id ───

export async function getChange(
  client: PoolClient,
  actor: ChangeActor,
  changeId: string,
): Promise<Record<string, unknown>> {
  const row = await client.query(
    `SELECT c.*,
              ct.name AS change_type_name,
              svc.name AS service_name,
              ag.name AS assignment_group_name,
              u.display_name AS assigned_to_name,
              r.display_name AS requested_by_name
       FROM changes c
       JOIN change_types ct ON ct.id = c.change_type_id
       LEFT JOIN services svc ON svc.id = c.service_id
       LEFT JOIN assignment_groups ag ON ag.id = c.assignment_group_id
       LEFT JOIN users u ON u.id = c.assigned_to
       LEFT JOIN users r ON r.id = c.requested_by
       WHERE c.tenant_id = current_tenant_id()
         AND c.id = $1`,
    [changeId],
  );
  if (row.rows.length === 0) throw NotFound('Change not found');
  const change = row.rows[0];
  const canWork = await canWorkOnChange(client, actor, change);
  if (!canWork) throw new AppError(403, 'Insufficient permissions');
  const [cis, approvals, conflicts] = await Promise.all([
    client.query(
      `SELECT cc.ci_id, ci.display_name, ci.name
         FROM change_cis cc
         JOIN configuration_items ci ON ci.id = cc.ci_id
         WHERE cc.tenant_id = current_tenant_id()
           AND cc.change_id = $1`,
      [changeId],
    ),
    client.query(
      `SELECT ca.*,
                u.display_name AS approver_name,
                g.name AS approver_group_name
         FROM change_approvals ca
         LEFT JOIN users u ON u.id = ca.approver_user_id
         LEFT JOIN assignment_groups g ON g.id = ca.approver_group_id
         WHERE ca.tenant_id = current_tenant_id()
           AND ca.change_id = $1
         ORDER BY ca.created_at`,
      [changeId],
    ),
    client.query(
      `SELECT cc.*, c2.number AS conflicting_change_number, c2.title AS conflicting_change_title
         FROM change_conflicts cc
         LEFT JOIN changes c2 ON c2.id = cc.conflicting_change_id
         WHERE cc.tenant_id = current_tenant_id()
           AND cc.change_id = $1
         ORDER BY cc.severity DESC, cc.created_at DESC`,
      [changeId],
    ),
  ]);
  const pendingApprovals = approvals.rows.filter((a: { status: string }) => a.status === 'pending').length;
  const allowedActions = computeAllowedChangeActions(change, pendingApprovals, cis.rows.length > 0);
  const custom_fields = await loadCustomFieldsMap(client, 'change', changeId);
  return {
    ...change,
    affected_cis: cis.rows,
    approvals: approvals.rows,
    conflicts: conflicts.rows,
    allowed_actions: allowedActions,
    custom_fields,
  };
}

// ─── POST /api/changes ───

/**
 * DB work for change creation. The `change.created` notification is fired by the
 * route using the returned change id. Unique-violation (23505) on the change
 * number propagates unchanged so the route can map it to a 409.
 */
export async function createChange(
  client: PoolClient,
  actor: ChangeActor,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const b = body || {};
  validateScheduleRange(b.scheduled_start, b.scheduled_end);
  const assignmentGroupId = asNullableString(b.assignment_group_id);
  if (!assignmentGroupId) {
    throw new AppError(400, 'assignment_group_id is required');
  }
  const createGroupOk = await isChangeEnabledGroup(client, assignmentGroupId);
  if (!createGroupOk) throw new AppError(400, 'Assignment group is not enabled for Change Management');
  const changeTypeId = asNullableString(b.change_type_id);
  const typeRes = await client.query(
    `SELECT * FROM change_types
       WHERE tenant_id = current_tenant_id()
         AND id = $1
         AND is_active = true`,
    [changeTypeId],
  );
  if (typeRes.rows.length === 0) throw new AppError(400, 'Invalid change type');
  const changeType = typeRes.rows[0] as Record<string, unknown>;

  const seq = await client.query(`SELECT nextval('change_number_seq') AS n`);
  const number = `CHG${String(seq.rows[0].n).padStart(7, '0')}`;

  const stage = asString(b.stage, 'request');
  let status = asString(b.status, 'draft');
  if (changeType.auto_approve && changeType.name === 'standard') {
    status = 'approved';
  }

  const title = asString(b.title);
  const description = asString(b.description).trim() || title.trim() || 'Draft change';
  const reasonForChange = asString(b.reason_for_change).trim() || 'Pending assessment';
  const implementationPlan = asString(b.implementation_plan).trim()
    || 'Implementation plan to be defined during planning.';
  const backoutPlan = asString(b.backout_plan).trim() || 'Backout plan to be defined during planning.';
  const priority = asString(b.priority, 'medium');
  const impact = asString(b.impact, 'medium');
  const category = asNullableString(b.category);
  const serviceId = asNullableString(b.service_id);
  const sla = await resolveSlaDueAt(client, 'change', {
    priority,
    impact,
    category,
    serviceId,
  });
  const slaDueAt = sla.resolutionDueAt;

  const created = await client.query(
    `INSERT INTO changes (
        tenant_id, number, change_type_id, standard_change_id, category, title, description, reason_for_change,
        stage, status, risk_level, impact, impact_description, implementation_plan, backout_plan, test_plan,
        requested_by, assigned_to, assignment_group_id, service_id, scheduled_start, scheduled_end, actual_start, actual_end,
        downtime_required, maintenance_window, implementation_notes, success, actual_downtime_minutes,
        related_problem_id, related_incident_id, priority, business_justification, estimated_cost, review_notes,
        sla_due_at, sla_breached
      ) VALUES (
        current_tenant_id(), $1, $2, $3, $4, $5, $6, $7,
        $8::change_stage_enum, $9::change_status_enum, $10::change_risk_enum, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23,
        COALESCE($24, false), $25, $26, $27, $28,
        $29, $30, $31::change_priority_enum, $32, $33, $34, $35, false
      ) RETURNING *`,
    [
      number,
      changeTypeId,
      asNullableString(b.standard_change_id),
      category,
      title,
      description,
      reasonForChange,
      stage,
      status,
      asString(b.risk_level, asString(changeType.default_risk_level)),
      impact,
      asNullableString(b.impact_description),
      implementationPlan,
      backoutPlan,
      asNullableString(b.test_plan),
      asNullableString(b.requested_by) ?? actor.id,
      asNullableString(b.assigned_to),
      assignmentGroupId,
      serviceId,
      asNullableString(b.scheduled_start),
      asNullableString(b.scheduled_end),
      asNullableString(b.actual_start),
      asNullableString(b.actual_end),
      b.downtime_required,
      asNullableString(b.maintenance_window),
      asNullableString(b.implementation_notes),
      b.success ?? null,
      b.actual_downtime_minutes ?? null,
      asNullableString(b.related_problem_id),
      asNullableString(b.related_incident_id),
      priority,
      asNullableString(b.business_justification),
      b.estimated_cost ?? null,
      asNullableString(b.review_notes),
      slaDueAt,
    ],
  );
  const change = created.rows[0] as Record<string, unknown>;
  const changeId = String(change.id);
  const cis = Array.isArray(b.affected_cis) ? b.affected_cis : [];
  for (const ciId of cis) {
    await client.query(
      `INSERT INTO change_cis (tenant_id, change_id, ci_id)
         VALUES (current_tenant_id(), $1, $2)
         ON CONFLICT (tenant_id, change_id, ci_id) DO NOTHING`,
      [changeId, ciId],
    );
  }

  await refreshChangeConflicts(client, changeId);
  await addChangeJournalEntry(client, {
    changeId,
    authorId: actor.id,
    entryType: 'state_change',
    content: `Change created (${String(change.status)} / ${String(change.stage)})`,
    isCustomerVisible: false,
  });
  await upsertCustomFields(client, 'change', changeId, asCustomFields(b.custom_fields), 'create');
  const custom_fields = await loadCustomFieldsMap(client, 'change', changeId);
  return { ...change, custom_fields };
}

// ─── PATCH /api/changes/:id ───

export async function updateChange(
  client: PoolClient,
  actor: ChangeActor,
  changeId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const currentRes = await client.query(
    `SELECT * FROM changes
       WHERE tenant_id = current_tenant_id()
         AND id = $1`,
    [changeId],
  );
  if (currentRes.rows.length === 0) throw NotFound('Change not found');
  const current = currentRes.rows[0] as Record<string, unknown>;
  const canWork = await canWorkOnChange(client, actor, current);
  if (!canWork) throw new AppError(403, 'Insufficient permissions');
  const updates: Record<string, unknown> = { ...(body || {}) };
  const hasCustomFieldsPayload = Object.prototype.hasOwnProperty.call(updates, 'custom_fields');
  const customFieldsPayload = asCustomFields(updates.custom_fields);
  delete updates.custom_fields;
  validateScheduleRange(
    updates.scheduled_start ?? current.scheduled_start,
    updates.scheduled_end ?? current.scheduled_end,
  );
  if (
    updates.assignment_group_id !== undefined
    && (updates.assignment_group_id === null || String(updates.assignment_group_id).trim() === '')
  ) {
    throw new AppError(400, 'assignment_group_id is required');
  }
  const effectiveAssignmentGroupId = updates.assignment_group_id ?? current.assignment_group_id;
  if (!effectiveAssignmentGroupId) {
    throw new AppError(400, 'assignment_group_id is required');
  }
  if (updates.assignment_group_id !== undefined) {
    const ok = await isChangeEnabledGroup(client, String(updates.assignment_group_id));
    if (!ok) throw new AppError(400, 'Assignment group is not enabled for Change Management');
  }
  {
    const nextStatus = asString(updates.status ?? current.status);
    if (nextStatus === 'implemented' || nextStatus === 'closed') {
      await assertRequiredChecklistsComplete(client, 'change', changeId);
    }
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(updates)) {
    if (k === 'affected_cis') continue;
    if (k === 'status') {
      sets.push(`status = $${i++}::change_status_enum`);
    } else if (k === 'stage') {
      sets.push(`stage = $${i++}::change_stage_enum`);
    } else if (k === 'risk_level') {
      sets.push(`risk_level = $${i++}::change_risk_enum`);
    } else if (k === 'priority') {
      sets.push(`priority = $${i++}::change_priority_enum`);
    } else {
      sets.push(`${k} = $${i++}`);
    }
    vals.push(v);
  }
  if (
    updates.priority !== undefined
    || updates.impact !== undefined
    || updates.category !== undefined
    || updates.service_id !== undefined
    || updates.status !== undefined
  ) {
    const nextStatus = asString(updates.status ?? current.status);
    if (['closed', 'cancelled', 'rejected'].includes(nextStatus)) {
      sets.push('sla_due_at = NULL');
    } else {
      const due = await resolveSlaDueAt(client, 'change', {
        priority: asNullableString(updates.priority ?? current.priority),
        impact: asNullableString(updates.impact ?? current.impact),
        category: asNullableString(updates.category ?? current.category),
        serviceId: asNullableString(updates.service_id ?? current.service_id),
      });
      sets.push(`sla_due_at = $${i++}`);
      vals.push(due.resolutionDueAt);
      sets.push('sla_breached = false');
    }
  }
  if (sets.length) {
    vals.push(changeId);
    await client.query(
      `UPDATE changes
         SET ${sets.join(', ')}
         WHERE tenant_id = current_tenant_id()
           AND id = $${i}`,
      vals,
    );
  }
  if (Array.isArray(updates.affected_cis)) {
    await client.query(
      `DELETE FROM change_cis
         WHERE tenant_id = current_tenant_id()
           AND change_id = $1`,
      [changeId],
    );
    for (const ciId of updates.affected_cis) {
      await client.query(
        `INSERT INTO change_cis (tenant_id, change_id, ci_id)
           VALUES (current_tenant_id(), $1, $2)
           ON CONFLICT (tenant_id, change_id, ci_id) DO NOTHING`,
        [changeId, ciId],
      );
    }
  }
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
    current as Record<string, unknown>,
    (updated.rows[0] || {}) as Record<string, unknown>,
  );
  await writeChangeStateJournal(client, {
    changeId,
    authorId: actor.id,
    before: current,
    after: updated.rows[0] || {},
  });
  const templateIds = new Set<string>();
  for (const row of [current, updated.rows[0]]) {
    if (row?.status === 'closed' && row.standard_change_id) templateIds.add(String(row.standard_change_id));
  }
  for (const templateId of templateIds) {
    await refreshStandardChangeOutcome(client, templateId);
  }
  if (hasCustomFieldsPayload) {
    await upsertCustomFields(
      client,
      'change',
      changeId,
      customFieldsPayload,
      'update',
    );
  }
  const custom_fields = await loadCustomFieldsMap(client, 'change', changeId);
  return { ...updated.rows[0], custom_fields };
}
