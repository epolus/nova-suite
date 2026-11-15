/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Incident bulk update service ───
// Plain-argument service (PoolClient + args). No Request/Response.
import type { PoolClient } from 'pg';
import { startOlaClock } from '../../domain/sla';
import type { IncidentServiceResult } from './types';

// ─── PATCH /api/incidents/bulk ───

export async function bulkUpdate(
  client: PoolClient,
  ids: string[],
  action: string,
  value?: string,
): Promise<IncidentServiceResult<{ success: true; updated: number }>> {
  if (action === 'close') {
    await client.query(
      `UPDATE incidents SET
             status = 'closed',
             closed_at = NOW(),
             closure_category_id = COALESCE(closure_category_id, category_id),
             updated_at = NOW()
           WHERE id = ANY($1::uuid[]) AND status NOT IN ('closed', 'cancelled')`,
      [ids],
    );
  } else if (action === 'assign_group') {
    const ola = await startOlaClock(client, value || null);
    await client.query(
      `UPDATE incidents i
           SET
             assignment_group_id = $1,
             assigned_to = CASE
               WHEN $1::uuid IS NULL THEN i.assigned_to
               WHEN i.assigned_to IS NULL THEN NULL
               WHEN EXISTS (
                 SELECT 1
                 FROM assignment_group_members agm
                 WHERE agm.group_id = $1::uuid
                   AND agm.user_id = i.assigned_to
               ) THEN i.assigned_to
               ELSE NULL
             END,
             ola_group_id = $3,
             ola_response_due_at = $4,
             ola_resolution_due_at = $5,
             ola_responded_at = NULL,
             ola_paused_ms = 0,
             ola_paused_at = CASE
               WHEN $3::uuid IS NULL THEN NULL
               WHEN i.sla_paused_at IS NOT NULL THEN now()
               ELSE NULL
             END,
             updated_at = NOW()
           WHERE i.id = ANY($2::uuid[]) AND i.status NOT IN ('closed', 'cancelled')`,
      [value || null, ids, ola.ola_group_id, ola.ola_response_due_at, ola.ola_resolution_due_at],
    );
  } else {
    return { ok: false, status: 400, error: 'Unknown action' };
  }
  return { ok: true, data: { success: true, updated: ids.length } };
}
