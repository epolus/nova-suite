/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  labelsMatch,
  normalizeSeverity,
  type ParsedInboundAlert,
} from '@nova-suite/shared';
import { db } from '../data/db';
import { resolveSlaDueAt, startOlaClock } from './sla';
import { enqueueIncidentEscalationStartJob, enqueueNotificationDispatchStartJob } from '../temporal/workflow-start-queue';

type CiMatch = { id: string; supported_by: string | null };
type DefinitionRow = {
  id: string;
  source: string | null;
  severity: string | null;
  match_labels: Record<string, string> | null;
  severity_map: Record<string, string> | null;
  action: 'none' | 'incident' | 'workflow';
  assignment_group_id: string | null;
  impact: string | null;
  urgency: string | null;
  workflow_key: string | null;
};
type OpenAlert = { id: string; number: string; incident_id: string | null; inserted?: boolean };

export type IngestAlertResult = {
  fingerprint: string;
  duplicate: boolean;
  alertNumber: string | null;
  incidentNumber: string | null;
  resolvedIncidentId: string | null;
  reopenedIncidentId: string | null;
};

async function matchCi(keys: string[]): Promise<CiMatch | null> {
  for (const key of keys) {
    const row = await db.getOne<CiMatch>(
      `SELECT id, supported_by
       FROM configuration_items
       WHERE tenant_id = current_tenant_id()
         AND is_active = true
         AND (
           external_id_1 = $1 OR external_id_2 = $1
           OR lower(name) = lower($1)
           OR lower(COALESCE(display_name, '')) = lower($1)
         )
       LIMIT 1`,
      [key],
    );
    if (row) return row;
  }
  return null;
}

async function suppressingChange(ciId: string): Promise<string | null> {
  const row = await db.getOne<{ number: string }>(
    `SELECT c.number
     FROM changes c
     JOIN change_cis cc ON cc.change_id = c.id AND cc.tenant_id = c.tenant_id
     WHERE c.tenant_id = current_tenant_id()
       AND cc.ci_id = $1
       AND c.status IN ('scheduled', 'implementing')
       AND c.scheduled_start IS NOT NULL
       AND c.scheduled_start <= now()
       AND (c.scheduled_end IS NULL OR c.scheduled_end >= now())
     ORDER BY c.scheduled_start DESC
     LIMIT 1`,
    [ciId],
  );
  return row?.number || null;
}

function definitionMatches(definition: DefinitionRow, alert: ParsedInboundAlert, normalized: string): boolean {
  if (definition.source && definition.source !== alert.source) return false;
  if (definition.severity && definition.severity.toLowerCase() !== normalized) return false;
  const expected = definition.match_labels && typeof definition.match_labels === 'object' ? definition.match_labels : {};
  return labelsMatch(alert.labels, expected);
}

async function journalAuthorId(): Promise<string | null> {
  const author = await db.getOne<{ id: string }>(
    `SELECT u.id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
     JOIN roles r ON r.id = ur.role_id AND r.tenant_id = u.tenant_id
     WHERE u.tenant_id = current_tenant_id()
       AND u.is_active = true
       AND r.name IN ('admin', 'fulfiller', 'system')
     ORDER BY CASE r.name WHEN 'admin' THEN 0 WHEN 'fulfiller' THEN 1 ELSE 2 END, u.created_at
     LIMIT 1`,
  );
  return author?.id || null;
}

async function insertEvent(alert: ParsedInboundAlert, ciId: string | null): Promise<string | null> {
  const row = await db.getOne<{ id: string }>(
    `INSERT INTO events (
       tenant_id, source, external_event_id, fingerprint, status, severity, title,
       labels, payload, source_url, configuration_item_id, occurred_at
     ) VALUES (
       current_tenant_id(), $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11
     )
     ON CONFLICT (tenant_id, source, external_event_id) WHERE external_event_id IS NOT NULL
     DO NOTHING
     RETURNING id`,
    [
      alert.source,
      alert.externalEventId,
      alert.fingerprint,
      alert.status,
      alert.severity,
      alert.title,
      JSON.stringify(alert.labels),
      JSON.stringify(alert.payload),
      alert.sourceUrl,
      ciId,
      alert.occurredAt,
    ],
  );
  return row?.id || null;
}

async function openEpisode(alert: ParsedInboundAlert, ciId: string | null, normalized: string): Promise<OpenAlert> {
  const seq = await db.getOne<{ nextval: string }>("SELECT nextval('alert_number_seq') AS nextval");
  const number = `ALT${String(seq?.nextval || '0').padStart(7, '0')}`;
  const row = await db.getOne<OpenAlert>(
    `INSERT INTO alerts (
       tenant_id, number, source, fingerprint, status, severity, title, labels, source_url, configuration_item_id
     ) VALUES (
       current_tenant_id(), $1, $2, $3, 'firing', $4, $5, $6::jsonb, $7, $8
     )
     ON CONFLICT (tenant_id, source, fingerprint) WHERE status = 'firing'
     DO UPDATE SET
       event_count = alerts.event_count + 1,
       last_seen_at = now(),
       title = EXCLUDED.title,
       severity = EXCLUDED.severity,
       source_url = COALESCE(alerts.source_url, EXCLUDED.source_url),
       configuration_item_id = COALESCE(alerts.configuration_item_id, EXCLUDED.configuration_item_id)
     RETURNING id, number, incident_id, (xmax = 0) AS inserted`,
    [number, alert.source, alert.fingerprint, normalized, alert.title, JSON.stringify(alert.labels), alert.sourceUrl, ciId],
  );
  return row || { id: '', number, incident_id: null, inserted: false };
}

async function createIncident(input: {
  alert: ParsedInboundAlert;
  alertNumber: string;
  ci: CiMatch;
  definition: DefinitionRow;
  authorId: string;
  tenantId: string;
}): Promise<{ id: string; number: string } | null> {
  const groupId = input.definition.assignment_group_id || input.ci.supported_by;
  if (!groupId) return null;
  const impact = input.definition.impact || 'high';
  const urgency = input.definition.urgency || 'high';
  const priorityRow = await db.getOne<{ priority: number }>(
    'SELECT calculate_priority($1, $2) AS priority',
    [impact, urgency],
  );
  const priority = priorityRow?.priority || 3;
  const seq = await db.getOne<{ nextval: string }>("SELECT nextval('incident_number_seq') AS nextval");
  const number = `INC${String(seq?.nextval || '0').padStart(7, '0')}`;
  const sql = { query: (text: string, params?: unknown[]) => db.query(text, params) };
  const sla = await resolveSlaDueAt(sql, 'incident', {
    priority,
    impact,
    urgency,
    category: 'event',
    serviceId: null,
  });
  const ola = await startOlaClock(sql, groupId);
  const description = [
    input.alert.title,
    '',
    `Source: ${input.alert.source}`,
    `Alert: ${input.alertNumber}`,
    input.alert.sourceUrl || '',
  ].filter((line) => line !== '').join('\n');
  const incident = await db.getOne<{ id: string; number: string }>(
    `INSERT INTO incidents (
       tenant_id, number, title, description, status, impact, urgency, priority,
       assignment_group_id, configuration_item_id, category,
       sla_due_at, response_due_at, sla_definition_id,
       ola_group_id, ola_response_due_at, ola_resolution_due_at, ola_responded_at, ola_paused_at, ola_paused_ms
     ) VALUES (
       current_tenant_id(), $1, $2, $3, 'new', $4, $5, $6,
       $7, $8, 'event',
       $9, $10, $11, $12, $13, $14, $15, $16, $17
     ) RETURNING id, number`,
    [
      number,
      input.alert.title,
      description,
      impact,
      urgency,
      priority,
      groupId,
      input.ci.id,
      sla.resolutionDueAt,
      sla.responseDueAt,
      sla.slaDefinitionId,
      ola.ola_group_id,
      ola.ola_response_due_at,
      ola.ola_resolution_due_at,
      ola.ola_responded_at,
      ola.ola_paused_at,
      ola.ola_paused_ms,
    ],
  );
  if (!incident) return null;
  await db.query(
    `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content, is_customer_visible)
     VALUES (current_tenant_id(), $1, $2, 'state_change', $3, false)`,
    [incident.id, input.authorId, `Incident created with priority ${priority}`],
  );
  await db.query(
    `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content, is_customer_visible)
     VALUES (current_tenant_id(), $1, $2, 'state_change', $3, false)`,
    [incident.id, input.authorId, `Alert ${input.alertNumber} opened`],
  );
  await enqueueNotificationDispatchStartJob({
    tenantId: input.tenantId,
    entityType: 'incident',
    triggerKey: 'incident.created',
    entityId: incident.id,
    actorUserId: input.authorId,
  });
  if (sla.resolutionDueAt || sla.responseDueAt) {
    await enqueueIncidentEscalationStartJob({
      tenantId: input.tenantId,
      incidentId: incident.id,
      priority,
      slaDueAt: sla.resolutionDueAt || sla.responseDueAt!,
      responseDueAt: sla.responseDueAt,
    });
  }
  return incident;
}

async function applyDefinition(input: {
  alert: ParsedInboundAlert;
  episode: OpenAlert;
  ci: CiMatch | null;
  authorId: string | null;
  tenantId: string;
  normalized: string;
}): Promise<string | null> {
  const definitions = await db.getMany<DefinitionRow>(
    `SELECT id, source, severity, match_labels, severity_map, action, assignment_group_id, impact, urgency, workflow_key
     FROM alert_definitions
     WHERE tenant_id = current_tenant_id() AND is_active = true
     ORDER BY sort_order, created_at`,
  );
  const definition = definitions.find((row) => definitionMatches(row, input.alert, normalizeSeverity(input.alert.severity, row.severity_map)));
  if (!definition) return null;
  const changeNumber = input.ci ? await suppressingChange(input.ci.id) : null;
  await db.query(
    `UPDATE alerts
     SET definition_id = $2, suppressed_reason = $3
     WHERE id = $1`,
    [input.episode.id, definition.id, changeNumber],
  );
  if (changeNumber) return null;
  if (definition.action === 'incident' && input.ci && input.authorId) {
    const incident = await createIncident({
      alert: input.alert,
      alertNumber: input.episode.number,
      ci: input.ci,
      definition,
      authorId: input.authorId,
      tenantId: input.tenantId,
    });
    if (!incident) return null;
    await db.query('UPDATE alerts SET incident_id = $2 WHERE id = $1', [input.episode.id, incident.id]);
    return incident.number;
  }
  if (definition.action === 'workflow' && definition.workflow_key === 'notification_dispatch') {
    const workflowId = await enqueueNotificationDispatchStartJob({
      tenantId: input.tenantId,
      entityType: 'alert',
      triggerKey: 'alert.firing',
      entityId: input.episode.id,
      actorUserId: input.authorId,
    });
    await db.query('UPDATE alerts SET workflow_id = $2 WHERE id = $1', [input.episode.id, workflowId]);
  }
  return null;
}

/** A later firing can open the incident once a CI matches. The first delivery often arrives before the CI exists. */
async function openMissedIncident(input: {
  alert: ParsedInboundAlert;
  episode: OpenAlert;
  ci: CiMatch | null;
  authorId: string | null;
  tenantId: string;
}): Promise<string | null> {
  if (!input.ci || !input.authorId) return null;
  const linked = await db.getOne<DefinitionRow>(
    `SELECT d.id, d.source, d.severity, d.match_labels, d.severity_map, d.action, d.assignment_group_id, d.impact, d.urgency, d.workflow_key
     FROM alerts a
     JOIN alert_definitions d ON d.id = a.definition_id AND d.is_active = true
     WHERE a.id = $1`,
    [input.episode.id],
  );
  const definitions = linked ? [] : await db.getMany<DefinitionRow>(
    `SELECT id, source, severity, match_labels, severity_map, action, assignment_group_id, impact, urgency, workflow_key
     FROM alert_definitions
     WHERE tenant_id = current_tenant_id() AND is_active = true
     ORDER BY sort_order, created_at`,
  );
  const definition = linked ?? definitions.find((row) => definitionMatches(row, input.alert, normalizeSeverity(input.alert.severity, row.severity_map)));
  if (!definition || definition.action !== 'incident') return null;
  const changeNumber = await suppressingChange(input.ci.id);
  if (changeNumber) {
    await db.query(
      `UPDATE alerts SET suppressed_reason = $2, configuration_item_id = $3 WHERE id = $1`,
      [input.episode.id, changeNumber, input.ci.id],
    );
    return null;
  }
  const incident = await createIncident({
    alert: input.alert,
    alertNumber: input.episode.number,
    ci: input.ci,
    definition,
    authorId: input.authorId,
    tenantId: input.tenantId,
  });
  if (!incident) return null;
  const saved = await db.query(
    `UPDATE alerts
     SET incident_id = $2, definition_id = COALESCE(definition_id, $3), configuration_item_id = $4
     WHERE id = $1 AND incident_id IS NULL`,
    [input.episode.id, incident.id, definition.id, input.ci.id],
  );
  return saved.rowCount ? incident.number : null;
}

async function previousEpisodeIncident(source: string, fingerprint: string, exceptAlertId: string): Promise<{
  id: string;
  number: string;
  status: string;
  definition_id: string | null;
} | null> {
  return db.getOne(
    `SELECT i.id, i.number, i.status, a.definition_id
     FROM alerts a
     JOIN incidents i ON i.id = a.incident_id
     WHERE a.tenant_id = current_tenant_id()
       AND a.source = $1
       AND a.fingerprint = $2
       AND a.id <> $3
     ORDER BY a.last_seen_at DESC
     LIMIT 1`,
    [source, fingerprint, exceptAlertId],
  );
}

/** Resolved and closed incidents come back to in progress when the same alert fires again. */
async function reopenLinkedIncident(alertNumber: string, incidentId: string, authorId: string | null): Promise<boolean> {
  const row = await db.getOne<{ status: string }>(
    `SELECT status FROM incidents WHERE id = $1`,
    [incidentId],
  );
  if (!row || (row.status !== 'resolved' && row.status !== 'closed')) return false;
  const updated = await db.query(
    `UPDATE incidents
     SET status = 'in_progress', resolved_at = NULL, closed_at = NULL
     WHERE id = $1 AND status IN ('resolved', 'closed')`,
    [incidentId],
  );
  if (!updated.rowCount) return false;
  if (authorId) {
    await db.query(
      `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content, is_customer_visible)
       VALUES (current_tenant_id(), $1, $2, 'state_change', $3, false)`,
      [incidentId, authorId, `Alert ${alertNumber} fired again. Status changed from ${row.status} to in_progress.`],
    );
  }
  return true;
}

async function reusePreviousIncident(input: {
  alert: ParsedInboundAlert;
  episode: OpenAlert;
  authorId: string | null;
}): Promise<{ number: string; reopenedId: string | null } | null> {
  const previous = await previousEpisodeIncident(input.alert.source, input.alert.fingerprint, input.episode.id);
  if (!previous || previous.status === 'cancelled') return null;
  await db.query(
    `UPDATE alerts
     SET incident_id = $2, definition_id = COALESCE(definition_id, $3)
     WHERE id = $1 AND incident_id IS NULL`,
    [input.episode.id, previous.id, previous.definition_id],
  );
  const reopened = await reopenLinkedIncident(input.episode.number, previous.id, input.authorId);
  if (!reopened && input.authorId && previous.status !== 'resolved' && previous.status !== 'closed') {
    await db.query(
      `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content, is_customer_visible)
       VALUES (current_tenant_id(), $1, $2, 'state_change', $3, false)`,
      [previous.id, input.authorId, `Alert ${input.episode.number} fired again.`],
    );
  }
  return { number: previous.number, reopenedId: reopened ? previous.id : null };
}

async function clearIncident(alertNumber: string, incidentId: string, authorId: string | null): Promise<string | null> {
  const state = await db.getOne<{ status: string; worked: boolean }>(
    `SELECT i.status,
            EXISTS (
              SELECT 1 FROM incident_journal j
              WHERE j.incident_id = i.id
                AND NOT (
                  j.entry_type = 'state_change'
                  AND (j.content LIKE 'Incident created%' OR j.content LIKE 'Alert %')
                )
            ) AS worked
     FROM incidents i
     WHERE i.id = $1`,
    [incidentId],
  );
  const untouched = state?.status === 'new' && state.worked === false;
  if (authorId) {
    await db.query(
      `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content, is_customer_visible)
       VALUES (current_tenant_id(), $1, $2, 'state_change', $3, false)`,
      [
        incidentId,
        authorId,
        untouched
          ? `Alert ${alertNumber} cleared. Incident resolved because it was still new.`
          : `Alert ${alertNumber} cleared.`,
      ],
    );
  }
  if (!untouched) return null;
  await db.query(
    `UPDATE incidents
     SET status = 'resolved', resolved_at = now(), resolution_notes = $2
     WHERE id = $1 AND status = 'new'`,
    [incidentId, `Alert ${alertNumber} cleared before anyone worked the incident.`],
  );
  return incidentId;
}

export async function ingestAlerts(tenantId: string, alerts: ParsedInboundAlert[]): Promise<IngestAlertResult[]> {
  return db.withTenantTransaction(tenantId, '00000000-0000-0000-0000-000000000000', 'system', async () => {
    const authorId = await journalAuthorId();
    const results: IngestAlertResult[] = [];
    for (const alert of alerts) {
      const ci = await matchCi(alert.ciKeys);
      const eventId = await insertEvent(alert, ci?.id || null);
      if (!eventId) {
        results.push({
          fingerprint: alert.fingerprint,
          duplicate: true,
          alertNumber: null,
          incidentNumber: null,
          resolvedIncidentId: null,
          reopenedIncidentId: null,
        });
        continue;
      }
      if (alert.status === 'resolved') {
        const open = await db.getOne<OpenAlert>(
          `SELECT id, number, incident_id
           FROM alerts
           WHERE tenant_id = current_tenant_id()
             AND source = $1 AND fingerprint = $2 AND status = 'firing'
           LIMIT 1`,
          [alert.source, alert.fingerprint],
        );
        if (!open) {
          results.push({ fingerprint: alert.fingerprint, duplicate: false, alertNumber: null, incidentNumber: null, resolvedIncidentId: null, reopenedIncidentId: null });
          continue;
        }
        await db.query(
          `UPDATE events SET alert_id = $2 WHERE id = $1`,
          [eventId, open.id],
        );
        await db.query(
          `UPDATE alerts SET status = 'resolved', resolved_at = now(), event_count = event_count + 1, last_seen_at = now() WHERE id = $1`,
          [open.id],
        );
        const resolvedIncidentId = open.incident_id
          ? await clearIncident(open.number, open.incident_id, authorId)
          : null;
        results.push({
          fingerprint: alert.fingerprint,
          duplicate: false,
          alertNumber: open.number,
          incidentNumber: null,
          resolvedIncidentId,
          reopenedIncidentId: null,
        });
        continue;
      }

      const normalized = normalizeSeverity(alert.severity, null);
      const episode = await openEpisode(alert, ci?.id || null, normalized);
      await db.query('UPDATE events SET alert_id = $2 WHERE id = $1', [eventId, episode.id]);
      let incidentNumber: string | null = null;
      let reopenedIncidentId: string | null = null;
      if (episode.inserted) {
        const suppressed = ci ? await suppressingChange(ci.id) : null;
        const reused = suppressed ? null : await reusePreviousIncident({ alert, episode, authorId });
        if (reused) {
          incidentNumber = reused.number;
          reopenedIncidentId = reused.reopenedId;
        } else {
          incidentNumber = await applyDefinition({
            alert,
            episode,
            ci,
            authorId,
            tenantId,
            normalized,
          });
        }
      } else if (!episode.incident_id) {
        const reused = await reusePreviousIncident({ alert, episode, authorId });
        if (reused) {
          incidentNumber = reused.number;
          reopenedIncidentId = reused.reopenedId;
        } else {
          incidentNumber = await openMissedIncident({ alert, episode, ci, authorId, tenantId });
        }
      } else if (authorId || episode.incident_id) {
        const reopened = await reopenLinkedIncident(episode.number, episode.incident_id, authorId);
        if (reopened) {
          reopenedIncidentId = episode.incident_id;
          const linked = await db.getOne<{ number: string }>(`SELECT number FROM incidents WHERE id = $1`, [episode.incident_id]);
          incidentNumber = linked?.number || null;
        }
      }
      results.push({
        fingerprint: alert.fingerprint,
        duplicate: false,
        alertNumber: episode.number,
        incidentNumber,
        resolvedIncidentId: null,
        reopenedIncidentId,
      });
    }
    return results;
  });
}
