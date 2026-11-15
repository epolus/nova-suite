/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Incident SLA / visibility helpers ───
// Shared by incident service modules (journal, mutations, ...).
import { resumeOlaClock, resumeSlaClock, SLA_PAUSE_REASONS } from '../../domain/sla';

export const PAUSE_REASON_LIST = [...SLA_PAUSE_REASONS];

export async function clearPendingAndResumeSla(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  incident: {
    id: string;
    sla_paused_at: string | Date | null;
    sla_paused_ms: number | string | null;
    response_due_at: string | Date | null;
    sla_due_at: string | Date | null;
    ola_paused_at?: string | Date | null;
    ola_paused_ms?: number | string | null;
    ola_response_due_at?: string | Date | null;
    ola_resolution_due_at?: string | Date | null;
  },
): Promise<void> {
  const slaResumed = incident.sla_paused_at
    ? resumeSlaClock({
      sla_paused_at: incident.sla_paused_at,
      sla_paused_ms: incident.sla_paused_ms,
      response_due_at: incident.response_due_at,
      sla_due_at: incident.sla_due_at,
    })
    : null;
  const olaResumed = incident.ola_paused_at
    ? resumeOlaClock({
      ola_paused_at: incident.ola_paused_at,
      ola_paused_ms: incident.ola_paused_ms ?? 0,
      ola_response_due_at: incident.ola_response_due_at ?? null,
      ola_resolution_due_at: incident.ola_resolution_due_at ?? null,
    })
    : null;

  if (!slaResumed && !olaResumed) {
    await client.query(
      `UPDATE incidents
       SET pending_reason = NULL,
           resolution_code = CASE
             WHEN resolution_code = ANY($2::text[]) THEN NULL
             ELSE resolution_code
           END,
           updated_at = now()
       WHERE id = $1`,
      [incident.id, PAUSE_REASON_LIST],
    );
    return;
  }

  await client.query(
    `UPDATE incidents
     SET pending_reason = NULL,
         resolution_code = CASE
           WHEN resolution_code = ANY($2::text[]) THEN NULL
           ELSE resolution_code
         END,
         sla_paused_at = $3,
         sla_paused_ms = $4,
         response_due_at = $5,
         sla_due_at = $6,
         ola_paused_at = $7,
         ola_paused_ms = $8,
         ola_response_due_at = $9,
         ola_resolution_due_at = $10,
         updated_at = now()
     WHERE id = $1`,
    [
      incident.id,
      PAUSE_REASON_LIST,
      slaResumed ? slaResumed.sla_paused_at : incident.sla_paused_at,
      slaResumed ? slaResumed.sla_paused_ms : incident.sla_paused_ms,
      slaResumed ? slaResumed.response_due_at : incident.response_due_at,
      slaResumed ? slaResumed.sla_due_at : incident.sla_due_at,
      olaResumed ? olaResumed.ola_paused_at : (incident.ola_paused_at ?? null),
      olaResumed ? olaResumed.ola_paused_ms : (incident.ola_paused_ms ?? 0),
      olaResumed ? olaResumed.ola_response_due_at : (incident.ola_response_due_at ?? null),
      olaResumed ? olaResumed.ola_resolution_due_at : (incident.ola_resolution_due_at ?? null),
    ],
  );
}

export async function markIncidentResponded(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  incidentId: string,
): Promise<void> {
  await client.query(
    `UPDATE incidents SET responded_at = now() WHERE id = $1 AND responded_at IS NULL`,
    [incidentId],
  );
}

export async function markOlaResponded(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  incidentId: string,
): Promise<void> {
  await client.query(
    `UPDATE incidents
     SET ola_responded_at = now()
     WHERE id = $1 AND ola_responded_at IS NULL AND ola_response_due_at IS NOT NULL`,
    [incidentId],
  );
}

export function endUserIncidentVisibilityCondition(userParamRef: string): string {
  return `(i.caller_id = ${userParamRef} OR EXISTS (
    SELECT 1
    FROM incident_journal j
    WHERE j.incident_id = i.id
      AND j.author_id = ${userParamRef}
      AND j.entry_type = 'state_change'
      AND j.content LIKE 'Incident created with priority%'
  ))`;
}
