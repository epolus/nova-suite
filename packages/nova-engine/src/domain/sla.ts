/* SPDX-License-Identifier: AGPL-3.0-only */
type SlaProcessType = 'incident' | 'request' | 'task' | 'problem' | 'change';

type SlaContext = {
  priority?: number | string | null;
  impact?: string | null;
  urgency?: string | null;
  category?: string | null;
  serviceId?: string | null;
};

export async function resolveSlaDueAt(
  client: any,
  processType: SlaProcessType,
  context: SlaContext,
): Promise<string | null> {
  const rows = await client.query(
    `SELECT resolution_hours
     FROM sla_definitions sd
     WHERE sd.process_type = $1
       AND sd.is_active = true
       AND (sd.condition_priority IS NULL OR sd.condition_priority = $2)
       AND (sd.condition_impact IS NULL OR sd.condition_impact = $3)
       AND (sd.condition_urgency IS NULL OR sd.condition_urgency = $4)
       AND (sd.condition_category IS NULL OR sd.condition_category = $5)
       AND (sd.condition_service_id IS NULL OR sd.condition_service_id = $6)
     ORDER BY sd.sort_order ASC, sd.name ASC
     LIMIT 1`,
    [
      processType,
      context.priority ?? null,
      context.impact ?? null,
      context.urgency ?? null,
      context.category ?? null,
      context.serviceId ?? null,
    ],
  );
  const resolutionHours = Number(rows.rows?.[0]?.resolution_hours ?? 0);
  if (!Number.isFinite(resolutionHours) || resolutionHours <= 0) return null;
  return new Date(Date.now() + resolutionHours * 60 * 60 * 1000).toISOString();
}
