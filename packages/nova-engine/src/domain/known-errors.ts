/* SPDX-License-Identifier: AGPL-3.0-only */

export function hasKnownErrorContent(symptoms: unknown, workaround: unknown): boolean {
  return String(symptoms ?? '').trim().length > 0 && String(workaround ?? '').trim().length > 0;
}

/** A known error can be retired when a permanent fix is written or a change is linked. */
export function canRetireKnownError(permanentFix: unknown, linkedChangeCount: number): boolean {
  return String(permanentFix ?? '').trim().length > 0 || linkedChangeCount > 0;
}

const SUGGESTION_SQL = `
  SELECT ke.id, ke.title, ke.symptoms, ke.workaround, ke.severity,
         p.id AS problem_id, p.number AS problem_number
  FROM known_errors ke
  JOIN problems p ON p.id = ke.problem_id AND p.tenant_id = ke.tenant_id
  WHERE ke.tenant_id = current_tenant_id()
    AND ke.is_active = true
    AND (
      ($1::uuid IS NOT NULL AND p.affected_ci = $1::uuid)
      OR EXISTS (
        SELECT 1
        FROM problem_incidents pi
        JOIN incidents i ON i.id = pi.incident_id AND i.tenant_id = pi.tenant_id
        WHERE pi.tenant_id = current_tenant_id()
          AND pi.problem_id = p.id
          AND (
            ($1::uuid IS NOT NULL AND i.configuration_item_id = $1::uuid)
            OR ($2::uuid IS NOT NULL AND i.service_id = $2::uuid)
          )
      )
    )
  ORDER BY ke.updated_at DESC
  LIMIT $3`;

export async function suggestActiveKnownErrors(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  configurationItemId: string | null,
  serviceId: string | null,
  limit = 6,
): Promise<unknown[]> {
  if (!configurationItemId && !serviceId) return [];
  const result = await client.query(SUGGESTION_SQL, [configurationItemId, serviceId, limit]);
  return result.rows;
}
