/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Incident create / get / update services ───
// Plain-argument services (PoolClient + args). No Request/Response.
import type { PoolClient } from 'pg';
import { AppError, NotFound } from '../../middleware/errorHandler';
import {
  pauseOlaClock,
  pauseSlaClock,
  resolveSlaDueAt,
  resumeOlaClock,
  resumeSlaClock,
  shouldPauseSlaForPending,
  olaMarks,
  startOlaClock,
} from '../../domain/sla';
import {
  resolveCategoryAssignment,
  resolveResolutionCodeAssignment,
} from '../../domain/incident-classification';
import { loadCustomFieldsMap, upsertCustomFields } from '../../domain/custom-fields';
import { ensureSatisfactionResponse } from '../../domain/satisfaction';
import { assertRequiredChecklistsComplete } from '../../domain/checklists';
import {
  signalIncidentResolved,
  cancelIncidentAutoClose,
} from '../../temporal/workflows';
import {
  enqueueIncidentAutoCloseStartJob,
  enqueueNotificationDispatchStartJob,
} from '../../temporal/workflow-start-queue';
import { logger } from '../../logger';
import { replyIncidentStatus } from '../../notifications/chat-threads';
import {
  FORBIDDEN_INSUFFICIENT,
  type IncidentActor,
  type IncidentServiceResult,
} from './types';

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

function asDateOrNull(value: unknown): string | Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  return String(value);
}

function asMsOrNull(value: unknown): number | string | null {
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return String(value);
}

// ─── POST /api/incidents ───

export interface CreateIncidentResult {
  incident: Record<string, unknown>;
  priority: number;
  slaResolutionDueAt: string | Date | null;
  slaResponseDueAt: string | Date | null;
  custom_fields: unknown;
}

/**
 * DB work for incident creation. Escalation / notification / AI-assist side effects
 * are fired by the route using the returned values.
 */
export async function createIncident(
  client: PoolClient,
  actor: IncidentActor,
  body: Record<string, unknown>,
): Promise<CreateIncidentResult> {
  const title = String(body.title ?? '');
  const description = asNullableString(body.description);
  const impact = String(body.impact ?? 'medium');
  const urgency = String(body.urgency ?? 'medium');
  const assigned_to = asNullableString(body.assigned_to);
  const assignment_group_id = asNullableString(body.assignment_group_id);
  const caller_id = asNullableString(body.caller_id);
  const contact_info = asNullableString(body.contact_info);
  const service_id = asNullableString(body.service_id);
  const configuration_item_id = asNullableString(body.configuration_item_id);
  const category = asNullableString(body.category);
  const subcategory = asNullableString(body.subcategory);
  const category_id = asNullableString(body.category_id);
  const request_id = asNullableString(body.request_id);

  if (!assignment_group_id) {
    throw new AppError(400, 'assignment_group_id is required');
  }

  const categoryAssignment = await resolveCategoryAssignment(client, category_id, null);
  const resolvedCategoryId = categoryAssignment?.category_id ?? null;
  const resolvedCategory = categoryAssignment
    ? categoryAssignment.category
    : category;
  const resolvedSubcategory = categoryAssignment
    ? categoryAssignment.subcategory
    : subcategory;

  // Calculate priority from matrix
  const priorityResult = await client.query(
    'SELECT calculate_priority($1, $2) AS priority',
    [impact, urgency],
  );
  const priority = priorityResult.rows[0]?.priority || 3;

  // Generate number
  const seqResult = await client.query("SELECT nextval('incident_number_seq')");
  const number = `INC${seqResult.rows[0].nextval.toString().padStart(7, '0')}`;

  const sla = await resolveSlaDueAt(client, 'incident', {
    priority,
    impact,
    urgency,
    category: resolvedCategory || null,
    serviceId: service_id,
  });
  const ola = await startOlaClock(client, assignment_group_id);

  const result = await client.query(
    `INSERT INTO incidents (
          tenant_id, number, request_id, title, description,
          status, impact, urgency, priority,
          assigned_to, assignment_group_id, caller_id,
          contact_info, service_id, configuration_item_id,
          category, subcategory, category_id, sla_due_at, response_due_at, sla_definition_id,
          ola_group_id, ola_response_due_at, ola_resolution_due_at, ola_responded_at,
          ola_paused_at, ola_paused_ms
        ) VALUES (
          current_tenant_id(), $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11,
          $12, $13, $14,
          $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26
        ) RETURNING *`,
    [
      number, request_id, title, description,
      'new', impact, urgency, priority,
      assigned_to, assignment_group_id, caller_id,
      contact_info, service_id, configuration_item_id,
      resolvedCategory, resolvedSubcategory, resolvedCategoryId,
      sla.resolutionDueAt, sla.responseDueAt,
      sla.slaDefinitionId,
      ola.ola_group_id, ola.ola_response_due_at, ola.ola_resolution_due_at, ola.ola_responded_at,
      ola.ola_paused_at, ola.ola_paused_ms,
    ],
  );

  const createdIncident = result.rows[0] as Record<string, unknown>;
  const createdIncidentId = String(createdIncident.id);

  // Add creation journal entry
  await client.query(
    `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
         VALUES (current_tenant_id(), $1, $2, 'state_change', $3)`,
    [createdIncidentId, actor.id, `Incident created with priority ${priority}`],
  );

  await upsertCustomFields(
    client,
    'incident',
    createdIncidentId,
    asCustomFields(body.custom_fields),
    'create',
  );
  const custom_fields = await loadCustomFieldsMap(client, 'incident', createdIncidentId);

  return {
    incident: createdIncident,
    priority,
    slaResolutionDueAt: sla.resolutionDueAt,
    slaResponseDueAt: sla.responseDueAt,
    custom_fields,
  };
}

// ─── GET /api/incidents/:id ───

export async function getIncident(
  client: PoolClient,
  actor: IncidentActor,
  incidentId: string,
): Promise<IncidentServiceResult<Record<string, unknown>>> {
  const result = await client.query(
    `SELECT i.*,
              a.display_name AS assigned_to_name,
              c.display_name AS caller_name,
              c.email AS caller_email,
              c.phone AS caller_phone,
              c.mobile AS caller_mobile,
              c.vip AS caller_vip,
              cd.name AS caller_department_name,
              mgr.display_name AS caller_manager_name,
              ci.name AS ci_name,
              ci.display_name AS ci_display_name,
              ag.name AS assignment_group_name,
              svc.name AS service_name
       FROM incidents i
       LEFT JOIN users a ON a.id = i.assigned_to
       LEFT JOIN users c ON c.id = i.caller_id
       LEFT JOIN departments cd ON cd.id = c.department_id
       LEFT JOIN users mgr ON mgr.id = c.manager_id
       LEFT JOIN configuration_items ci ON ci.id = i.configuration_item_id
       LEFT JOIN assignment_groups ag ON ag.id = i.assignment_group_id
       LEFT JOIN services svc ON svc.id = i.service_id
       WHERE i.id = $1`,
    [incidentId],
  );

  if (result.rows.length === 0) {
    throw NotFound('Incident not found');
  }

  const incident = result.rows[0];
  if (!actor.isFulfiller && incident.caller_id !== actor.id) {
    const submitterResult = await client.query(
      `SELECT 1
         FROM incident_journal j
         WHERE j.incident_id = $1
           AND j.author_id = $2
           AND j.entry_type = 'state_change'
           AND j.content LIKE 'Incident created with priority%'
         LIMIT 1`,
      [incidentId, actor.id],
    );
    if (submitterResult.rows.length === 0) {
      return FORBIDDEN_INSUFFICIENT;
    }
  }

  const links = await client.query(
    `SELECT DISTINCT ON (u.id) u.id, u.number, u.title, u.status::text AS status, u.link_kind
       FROM (
         SELECT mi.id, mi.number, mi.title, mi.status, 'primary'::text AS link_kind
         FROM major_incidents mi
         WHERE mi.primary_incident_id = $1::uuid
           AND mi.tenant_id = current_tenant_id()
           AND mi.status::text <> 'cancelled'
         UNION ALL
         SELECT mi.id, mi.number, mi.title, mi.status, 'related'::text
         FROM major_incidents mi
         INNER JOIN major_incident_related_incidents r
           ON r.major_incident_id = mi.id
          AND r.incident_id = $1::uuid
          AND r.tenant_id = current_tenant_id()
         WHERE mi.tenant_id = current_tenant_id()
           AND mi.status::text <> 'cancelled'
       ) u
       ORDER BY u.id, CASE WHEN u.link_kind = 'primary' THEN 0 ELSE 1 END`,
    [incidentId],
  );

  const marks = olaMarks(incident);
  const custom_fields = await loadCustomFieldsMap(client, 'incident', incidentId);
  return {
    ok: true,
    data: {
      ...incident,
      linked_major_incidents: links.rows,
      ola_response_mark: marks.response,
      ola_resolution_mark: marks.resolution,
      custom_fields,
    },
  };
}

// ─── PATCH /api/incidents/:id ───

/**
 * Full PATCH body: validation of transitions, SLA/OLA pause/resume, SQL update,
 * journal entries, and the Temporal / notification side effects that are
 * interleaved with the DB work.
 */
export async function updateIncident(
  client: PoolClient,
  actor: IncidentActor,
  incidentId: string,
  body: Record<string, unknown>,
): Promise<IncidentServiceResult<Record<string, unknown>>> {
  // Get current incident
  const existing = await client.query('SELECT * FROM incidents WHERE id = $1', [incidentId]);
  if (existing.rows.length === 0) {
    throw NotFound('Incident not found');
  }

  const current = existing.rows[0] as Record<string, unknown>;
  const updates: Record<string, unknown> = { ...body };
  const customFieldsPayload = asCustomFields(updates.custom_fields);
  const hasCustomFieldsPayload = Object.prototype.hasOwnProperty.call(updates, 'custom_fields');
  delete updates.custom_fields;
  const isFulfiller = actor.isFulfiller;
  const isCaller = current.caller_id === actor.id;

  if (!isFulfiller) {
    if (!isCaller) {
      return FORBIDDEN_INSUFFICIENT;
    }
    const allowedKeys = Object.keys(updates);
    const currentStatus = asString(current.status);
    const isReopenOnly = allowedKeys.length === 1 && allowedKeys[0] === 'status'
      && updates.status === 'in_progress' && currentStatus === 'resolved';
    const isCancelOnly = allowedKeys.length === 1 && allowedKeys[0] === 'status'
      && updates.status === 'cancelled'
      && !['closed', 'cancelled'].includes(currentStatus);
    if (!isReopenOnly && !isCancelOnly) {
      return {
        ok: false,
        status: 403,
        error: 'You can only reopen resolved incidents or cancel your own open incidents',
      };
    }
  }

  const categoryAssignment = await resolveCategoryAssignment(
    client,
    asNullableString(updates.category_id),
    asNullableString(current.category_id),
  );
  if (categoryAssignment) {
    updates.category_id = categoryAssignment.category_id;
    updates.category = categoryAssignment.category;
    updates.subcategory = categoryAssignment.subcategory;
  }

  const closureCategoryAssignment = await resolveCategoryAssignment(
    client,
    asNullableString(updates.closure_category_id),
    asNullableString(current.closure_category_id),
  );
  if (closureCategoryAssignment) {
    updates.closure_category_id = closureCategoryAssignment.category_id;
  }

  const resolutionCodeAssignment = await resolveResolutionCodeAssignment(
    client,
    asNullableString(updates.resolution_code_id),
    asNullableString(current.resolution_code_id),
  );
  if (resolutionCodeAssignment) {
    updates.resolution_code_id = resolutionCodeAssignment.resolution_code_id;
    if (resolutionCodeAssignment.resolution_code_id === null) {
      updates.resolution_code = null;
    } else if (updates.resolution_code === undefined) {
      updates.resolution_code = resolutionCodeAssignment.resolution_code;
    }
  }

  const currentStatus = asString(current.status);

  // Status automation
  if (updates.assignment_group_id !== undefined
    && updates.assignment_group_id !== current.assignment_group_id
    && updates.status === undefined
    && !['resolved', 'closed', 'cancelled'].includes(currentStatus)) {
    updates.status = 'assigned';
  }

  if (typeof updates.resolution_notes === 'string'
    && updates.resolution_notes.trim().length > 0
    && updates.status === undefined
    && !['resolved', 'closed', 'cancelled'].includes(currentStatus)) {
    updates.status = 'resolved';
  }

  // Pending reason lives on pending_reason. Older clients still send it as resolution_code.
  let nextReason: string | null = updates.pending_reason !== undefined
    ? asNullableString(updates.pending_reason)
    : asNullableString(current.pending_reason);
  if (
    (nextReason == null || nextReason.trim().length === 0)
    && typeof updates.resolution_code === 'string'
    && shouldPauseSlaForPending(updates.resolution_code)
  ) {
    nextReason = updates.resolution_code;
    delete updates.resolution_code;
  }

  if (updates.status === 'pending') {
    if (!nextReason || String(nextReason).trim().length === 0) {
      return {
        ok: false,
        status: 400,
        error: 'Pending reason is required when setting status to pending',
      };
    }
    updates.pending_reason = String(nextReason).trim();
  }

  // Pause/resume SLA clock on pending transitions with waiting_* reasons.
  const nextStatus = updates.status !== undefined ? asString(updates.status) : currentStatus;
  const enteringPendingPause = nextStatus === 'pending'
    && currentStatus !== 'pending'
    && shouldPauseSlaForPending(nextReason);
  const leavingPending = currentStatus === 'pending'
    && updates.status !== undefined
    && updates.status !== 'pending';
  if (leavingPending && updates.pending_reason === undefined) {
    updates.pending_reason = null;
  }
  if (
    leavingPending
    && updates.resolution_code === undefined
    && shouldPauseSlaForPending(asNullableString(current.resolution_code))
  ) {
    updates.resolution_code = null;
  }
  const resumeOnLeave = leavingPending && current.sla_paused_at;
  const groupChanged = updates.assignment_group_id !== undefined
    && updates.assignment_group_id !== current.assignment_group_id;
  if (groupChanged && !['resolved', 'closed', 'cancelled'].includes(nextStatus)) {
    const clock = await startOlaClock(client, asNullableString(updates.assignment_group_id), {
      paused: nextStatus === 'pending' && shouldPauseSlaForPending(nextReason),
    });
    Object.assign(updates, clock);
  }
  const olaActive = Boolean(
    (updates.ola_response_due_at ?? current.ola_response_due_at)
    || (updates.ola_resolution_due_at ?? current.ola_resolution_due_at),
  );

  if (enteringPendingPause) {
    const paused = pauseSlaClock({
      sla_paused_at: asDateOrNull(current.sla_paused_at),
      sla_paused_ms: asMsOrNull(current.sla_paused_ms),
      response_due_at: asDateOrNull(current.response_due_at),
      sla_due_at: asDateOrNull(current.sla_due_at),
    });
    updates.sla_paused_at = paused.sla_paused_at;
    updates.sla_paused_ms = paused.sla_paused_ms;
    if (!groupChanged && olaActive) {
      Object.assign(updates, pauseOlaClock({
        ola_paused_at: asDateOrNull(current.ola_paused_at),
        ola_paused_ms: asMsOrNull(current.ola_paused_ms),
        ola_response_due_at: asDateOrNull(current.ola_response_due_at),
        ola_resolution_due_at: asDateOrNull(current.ola_resolution_due_at),
      }));
    }
  } else if (resumeOnLeave) {
    const resumed = resumeSlaClock({
      sla_paused_at: asDateOrNull(current.sla_paused_at),
      sla_paused_ms: asMsOrNull(current.sla_paused_ms),
      response_due_at: asDateOrNull(current.response_due_at),
      sla_due_at: asDateOrNull(current.sla_due_at),
    });
    updates.sla_paused_at = resumed.sla_paused_at;
    updates.sla_paused_ms = resumed.sla_paused_ms;
    updates.response_due_at = resumed.response_due_at;
    updates.sla_due_at = resumed.sla_due_at;
    if (!groupChanged && current.ola_paused_at) {
      Object.assign(updates, resumeOlaClock({
        ola_paused_at: asDateOrNull(current.ola_paused_at),
        ola_paused_ms: asMsOrNull(current.ola_paused_ms),
        ola_response_due_at: asDateOrNull(current.ola_response_due_at),
        ola_resolution_due_at: asDateOrNull(current.ola_resolution_due_at),
      }));
    }
  }

  // Resolved requires solution notes.
  if (updates.status === 'resolved') {
    const resolutionText = typeof updates.resolution_notes === 'string'
      ? updates.resolution_notes
      : current.resolution_notes;
    if (!resolutionText || String(resolutionText).trim().length === 0) {
      return {
        ok: false,
        status: 400,
        error: 'Resolution notes are required when setting status to resolved',
      };
    }
  }

  // Keep required checklists complete while resolved/closed (including later saves).
  {
    const nextStatus = String(updates.status ?? current.status);
    if (nextStatus === 'resolved' || nextStatus === 'closed') {
      await assertRequiredChecklistsComplete(client, 'incident', String(incidentId));
    }
  }

  // Recalculate priority if impact or urgency changed
  if (updates.impact || updates.urgency) {
    const impact = updates.impact || current.impact;
    const urgency = updates.urgency || current.urgency;
    const priorityResult = await client.query(
      'SELECT calculate_priority($1, $2) AS priority',
      [impact, urgency],
    );
    updates.priority = priorityResult.rows[0]?.priority || current.priority;
  }

  // Handle resolution
  if (updates.status === 'resolved' && !current.resolved_at) {
    updates.resolved_at = new Date().toISOString();
  }
  if (updates.status && updates.status !== 'resolved' && current.status === 'resolved') {
    updates.resolved_at = null;
  }
  if (updates.status === 'closed' && !current.closed_at) {
    updates.closed_at = new Date().toISOString();
  }
  if (updates.status === 'closed') {
    const nextClosure = updates.closure_category_id !== undefined
      ? updates.closure_category_id
      : current.closure_category_id;
    if (!nextClosure) {
      const nextCategoryId = updates.category_id !== undefined
        ? updates.category_id
        : current.category_id;
      if (nextCategoryId) {
        updates.closure_category_id = nextCategoryId;
      }
    }
  }

  if (
    isFulfiller
    && !current.responded_at
    && current.status === 'new'
    && (nextStatus === 'assigned' || nextStatus === 'in_progress')
  ) {
    updates.responded_at = new Date().toISOString();
  }
  if (isFulfiller && nextStatus === 'in_progress' && current.status !== 'in_progress') {
    const olaDue = updates.ola_response_due_at !== undefined
      ? updates.ola_response_due_at
      : current.ola_response_due_at;
    const olaResponded = updates.ola_responded_at !== undefined
      ? updates.ola_responded_at
      : current.ola_responded_at;
    if (olaDue && !olaResponded) updates.ola_responded_at = new Date().toISOString();
  }

  // Build dynamic UPDATE
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 0;

  for (const [key, value] of Object.entries(updates)) {
    idx++;
    setClauses.push(`${key} = $${idx}`);
    params.push(value);
  }

  let updated = current;
  if (setClauses.length > 0) {
    idx++;
    params.push(incidentId);
    const result = await client.query(
      `UPDATE incidents SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    updated = result.rows[0];
  }

  const customPhase = nextStatus === 'resolved' ? 'resolve' : 'update';
  if (hasCustomFieldsPayload || customPhase === 'resolve') {
    await upsertCustomFields(
      client,
      'incident',
      String(incidentId),
      hasCustomFieldsPayload ? customFieldsPayload : {},
      customPhase,
    );
  }

  // Journal entries for key changes
  if (updates.status && updates.status !== current.status) {
    await client.query(
      `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
           VALUES (current_tenant_id(), $1, $2, 'state_change', $3)`,
      [incidentId, actor.id, `Status changed from ${current.status} to ${updates.status}`],
    );
    try {
      await replyIncidentStatus(client, {
        id: String(incidentId),
        number: String(current.number),
        status: String(updates.status),
      });
    } catch (err) {
      logger.warn({ err, incidentId }, 'Chat status reply failed');
    }

    // Signal escalation workflow when incident is resolved/closed/cancelled
    if (['resolved', 'closed', 'cancelled'].includes(asString(updates.status))) {
      signalIncidentResolved(String(incidentId)).catch(() => {});
    }

    if (updates.status === 'resolved') {
      enqueueNotificationDispatchStartJob({
        tenantId: actor.tenant_id,
        entityType: 'incident',
        triggerKey: 'incident.resolved',
        entityId: incidentId as string,
        actorUserId: actor.id,
      }).catch(() => {});
      await ensureSatisfactionResponse(client, incidentId as string);
    }

    // Start/reset auto-close timer when resolved; cancel when leaving resolved.
    if (updates.status === 'resolved') {
      const effectivePriority = updates.priority ?? current.priority;
      const effectiveImpact = updates.impact ?? current.impact;
      const effectiveUrgency = updates.urgency ?? current.urgency;
      const effectiveCategory = updates.category ?? current.category;
      const effectiveServiceId = updates.service_id ?? current.service_id;

      // Select the most specific matching active incident SLA by sort order.
      const autoCloseCfg = await client.query(
        `SELECT auto_close_days
             FROM sla_definitions sd
             WHERE sd.process_type = 'incident'
               AND sd.is_active = true
               AND (sd.condition_priority IS NULL OR sd.condition_priority = $1)
               AND (sd.condition_impact IS NULL OR sd.condition_impact = $2)
               AND (sd.condition_urgency IS NULL OR sd.condition_urgency = $3)
               AND (sd.condition_category IS NULL OR sd.condition_category = $4)
               AND (sd.condition_service_id IS NULL OR sd.condition_service_id = $5)
             ORDER BY sd.sort_order ASC, sd.name ASC
             LIMIT 1`,
        [effectivePriority, effectiveImpact, effectiveUrgency, effectiveCategory, effectiveServiceId],
      );
      const autoCloseDays = Number(autoCloseCfg.rows[0]?.auto_close_days ?? 7);

      enqueueIncidentAutoCloseStartJob({
        incidentId: incidentId as string,
        tenantId: actor.tenant_id,
        autoCloseAfterDays: autoCloseDays > 0 ? autoCloseDays : 7,
      }).catch(() => {});
    } else if (current.status === 'resolved') {
      cancelIncidentAutoClose(incidentId as string).catch(() => {});
    }
  }
  if (updates.assigned_to && updates.assigned_to !== current.assigned_to) {
    // Look up new assignee display name
    const assigneeRow = await client.query(
      `SELECT display_name FROM users WHERE id = $1 LIMIT 1`,
      [updates.assigned_to],
    );
    const assigneeName = assigneeRow.rows[0]?.display_name ?? 'you';
    await client.query(
      `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
           VALUES (current_tenant_id(), $1, $2, 'assignment', $3)`,
      [incidentId, actor.id, `Assigned to ${assigneeName}`],
    );
    enqueueNotificationDispatchStartJob({
      tenantId: actor.tenant_id,
      entityType: 'incident',
      triggerKey: 'incident.assigned',
      entityId: incidentId as string,
      actorUserId: actor.id,
    }).catch(() => {});
  }

  const custom_fields = await loadCustomFieldsMap(client, 'incident', String(incidentId));
  return { ok: true, data: { ...updated, custom_fields } };
}
