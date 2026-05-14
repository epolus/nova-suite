/* SPDX-License-Identifier: AGPL-3.0-only */
import { log } from '@temporalio/activity';
import { withTenantContext } from '../db';

/** System-generated rows: omit actor_user_id (FK to users); null is allowed. */

export type MajorIncidentSnapshot = {
  status: string;
  hasCommander: boolean;
  lastStakeholderAt: string | null;
};

export async function majorIncidentOnDeclared(
  tenantId: string,
  majorIncidentId: string,
  title: string,
  temporalWorkflowId: string,
): Promise<void> {
  log.info('Major incident declared', { tenantId, majorIncidentId, title });
  await withTenantContext(tenantId, async (client) => {
    await client.query(
      `UPDATE major_incidents SET temporal_workflow_id = $2, updated_at = now() WHERE id = $1`,
      [majorIncidentId, temporalWorkflowId],
    );
    await client.query(
      `INSERT INTO major_incident_events (tenant_id, major_incident_id, event_type, payload, actor_user_id)
       VALUES ($1, $2, 'declared', $3::jsonb, $4)`,
      [
        tenantId,
        majorIncidentId,
        JSON.stringify({ title, note: 'Temporal workflow started; war-room integration stub' }),
        null,
      ],
    );
  });
}

export async function majorIncidentGetSnapshot(
  tenantId: string,
  majorIncidentId: string,
): Promise<MajorIncidentSnapshot> {
  return await withTenantContext(tenantId, async (client) => {
    const r = await client.query(
      `SELECT mi.status,
              EXISTS (
                SELECT 1 FROM major_incident_participants p
                WHERE p.major_incident_id = mi.id AND p.role = 'commander'
              ) AS has_commander,
              (SELECT max(u.created_at) FROM major_incident_stakeholder_updates u
               WHERE u.major_incident_id = mi.id) AS last_stakeholder_at
       FROM major_incidents mi WHERE mi.id = $1`,
      [majorIncidentId],
    );
    if (r.rows.length === 0) {
      return { status: 'cancelled', hasCommander: false, lastStakeholderAt: null };
    }
    const row = r.rows[0] as Record<string, unknown>;
    const last = row.last_stakeholder_at as Date | null;
    return {
      status: String(row.status),
      hasCommander: Boolean(row.has_commander),
      lastStakeholderAt: last ? last.toISOString() : null,
    };
  });
}

export async function majorIncidentNudgeNoCommander(
  tenantId: string,
  majorIncidentId: string,
): Promise<void> {
  log.warn('Major incident: no commander after SLA window', { majorIncidentId });
  await withTenantContext(tenantId, async (client) => {
    await client.query(
      `INSERT INTO major_incident_events (tenant_id, major_incident_id, event_type, payload, actor_user_id)
       VALUES ($1, $2, 'nudge_no_commander', $3::jsonb, $4)`,
      [tenantId, majorIncidentId, JSON.stringify({ message: 'No commander assigned within 10 minutes' }), null],
    );
  });
}

export async function majorIncidentMaybeNudgeStakeholderComms(
  tenantId: string,
  majorIncidentId: string,
): Promise<void> {
  const snap = await majorIncidentGetSnapshot(tenantId, majorIncidentId);
  if (['resolved', 'cancelled'].includes(snap.status)) return;
  const last = snap.lastStakeholderAt ? new Date(snap.lastStakeholderAt).getTime() : 0;
  const staleMs = 30 * 60 * 1000;
  if (Date.now() - last < staleMs) return;
  log.warn('Major incident: stakeholder comms cadence missed', { majorIncidentId });
  await withTenantContext(tenantId, async (client) => {
    await client.query(
      `INSERT INTO major_incident_events (tenant_id, major_incident_id, event_type, payload, actor_user_id)
       VALUES ($1, $2, 'nudge_stakeholder_comms', $3::jsonb, $4)`,
      [
        tenantId,
        majorIncidentId,
        JSON.stringify({ message: 'No stakeholder update in the last 30 minutes' }),
        null,
      ],
    );
  });
}

export async function majorIncidentSetMonitoring(
  tenantId: string,
  majorIncidentId: string,
): Promise<void> {
  await withTenantContext(tenantId, async (client) => {
    await client.query(
      `UPDATE major_incidents
       SET status = 'monitoring',
           monitoring_until_at = now() + interval '5 minutes',
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2
         AND status::text NOT IN ('resolved', 'cancelled')`,
      [majorIncidentId, tenantId],
    );
    await client.query(
      `INSERT INTO major_incident_events (tenant_id, major_incident_id, event_type, payload, actor_user_id)
       VALUES ($1, $2, 'monitoring_window', $3::jsonb, $4)`,
      [
        tenantId,
        majorIncidentId,
        JSON.stringify({ minutes: 5 }),
        null,
      ],
    );
  });
}

export async function majorIncidentFinalizeResolved(
  tenantId: string,
  majorIncidentId: string,
): Promise<{ postmortemId: string }> {
  return await withTenantContext(tenantId, async (client) => {
    const summaryRow = await client.query(
      `SELECT resolution_summary FROM major_incidents WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [majorIncidentId],
    );
    const resolutionSummary =
      (summaryRow.rows[0] as { resolution_summary: string | null } | undefined)?.resolution_summary?.trim() ?? '';

    await client.query(
      `UPDATE major_incidents
       SET status = 'resolved',
           resolved_at = now(),
           postmortem_due_at = (now() + interval '5 days'),
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [majorIncidentId, tenantId],
    );

    let pm = await client.query(`SELECT id FROM postmortems WHERE major_incident_id = $1`, [majorIncidentId]);
    if (pm.rows.length === 0) {
      const ins = await client.query(
        `INSERT INTO postmortems (tenant_id, major_incident_id, status, authored_by)
         VALUES ($1, $2, 'draft', $3)
         RETURNING id`,
        [tenantId, majorIncidentId, null],
      );
      pm = ins;
    }
    const postmortemId = (pm.rows[0] as { id: string }).id;

    await client.query(
      `INSERT INTO major_incident_events (tenant_id, major_incident_id, event_type, payload, actor_user_id)
       VALUES ($1, $2, 'resolved', $3::jsonb, $4)`,
      [
        tenantId,
        majorIncidentId,
        JSON.stringify({
          postmortemId,
          ...(resolutionSummary ? { solution: resolutionSummary } : {}),
        }),
        null,
      ],
    );

    const miMeta = await client.query(
      `SELECT created_by, primary_incident_id FROM major_incidents WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [majorIncidentId],
    );
    const metaRow = miMeta.rows[0] as { created_by: string; primary_incident_id: string | null } | undefined;
    const journalAuthorId = metaRow?.created_by;
    const primaryIncidentId = metaRow?.primary_incident_id ?? null;

    const rel = await client.query(
      `SELECT incident_id FROM major_incident_related_incidents
       WHERE major_incident_id = $1 AND tenant_id = current_tenant_id()`,
      [majorIncidentId],
    );

    const incidentIds = new Set<string>();
    if (primaryIncidentId) incidentIds.add(primaryIncidentId);
    for (const r of rel.rows as { incident_id: string }[]) {
      incidentIds.add(r.incident_id);
    }

    const autoResolutionNotes = 'Automatically resolved: linked major incident was closed.';
    const journalContent = 'Incident resolved automatically when the linked major incident was closed.';

    for (const incidentId of incidentIds) {
      try {
        const upd = await client.query(
          `UPDATE incidents
           SET status = 'resolved'::incident_status_enum,
               resolved_at = COALESCE(resolved_at, now()),
               resolution_notes = CASE
                 WHEN resolution_notes IS NULL OR trim(resolution_notes) = '' THEN $2::text
                 ELSE resolution_notes
               END,
               resolution_code = COALESCE(resolution_code, 'major_incident'),
               updated_at = now()
           WHERE id = $1::uuid AND tenant_id = current_tenant_id()
             AND status::text NOT IN ('resolved', 'closed', 'cancelled')`,
          [incidentId, autoResolutionNotes],
        );
        if (journalAuthorId && (upd.rowCount ?? 0) > 0) {
          await client.query(
            `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content, is_customer_visible)
             VALUES (current_tenant_id(), $1::uuid, $2::uuid, 'state_change', $3, true)`,
            [incidentId, journalAuthorId, journalContent],
          );
        }
      } catch (err) {
        log.error('Failed to auto-resolve incident linked to major incident', {
          err: err instanceof Error ? err.message : String(err),
          incidentId,
          majorIncidentId,
        });
      }
    }

    return { postmortemId };
  });
}

export type PostmortemStatusRow = {
  status: string;
  dueAt: string | null;
};

export async function postmortemGetStatus(
  tenantId: string,
  postmortemId: string,
): Promise<PostmortemStatusRow> {
  return await withTenantContext(tenantId, async (client) => {
    const r = await client.query(
      `SELECT p.status, mi.postmortem_due_at
       FROM postmortems p
       JOIN major_incidents mi ON mi.id = p.major_incident_id
       WHERE p.id = $1`,
      [postmortemId],
    );
    if (r.rows.length === 0) return { status: 'unknown', dueAt: null };
    const row = r.rows[0] as { status: string; postmortem_due_at: Date | null };
    return {
      status: row.status,
      dueAt: row.postmortem_due_at ? row.postmortem_due_at.toISOString() : null,
    };
  });
}

export async function postmortemRecordWorkflowId(
  tenantId: string,
  postmortemId: string,
  temporalWorkflowId: string,
): Promise<void> {
  await withTenantContext(tenantId, async (client) => {
    await client.query(
      `UPDATE major_incidents mi
       SET postmortem_workflow_id = $1, updated_at = now()
       FROM postmortems p
       WHERE p.id = $2 AND p.major_incident_id = mi.id AND mi.tenant_id = $3`,
      [temporalWorkflowId, postmortemId, tenantId],
    );
  });
}

export async function postmortemLogReminder(
  tenantId: string,
  postmortemId: string,
  kind: 'due_soon' | 'overdue',
): Promise<void> {
  await withTenantContext(tenantId, async (client) => {
    await client.query(
      `INSERT INTO major_incident_events (tenant_id, major_incident_id, event_type, payload, actor_user_id)
       SELECT $1, p.major_incident_id, $2, $3::jsonb, $4
       FROM postmortems p WHERE p.id = $5`,
      [
        tenantId,
        'postmortem_reminder',
        JSON.stringify({ postmortemId, kind }),
        null,
        postmortemId,
      ],
    );
  });
}
