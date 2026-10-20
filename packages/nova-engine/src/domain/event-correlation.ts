/* SPDX-License-Identifier: AGPL-3.0-only */
import type { CorrelationHint, RcaCorrelationAdapter } from '../ai/rca-correlation';

type Sql = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

export function storedAlertAdapter(client: Sql): RcaCorrelationAdapter {
  return {
    async correlateAlerts(incident) {
      if (!incident.configuration_item_id) return [];
      const anchor = incident.created_at || new Date().toISOString();
      const alerts = await client.query(
        `SELECT id, number, title, severity, first_seen_at
         FROM alerts
         WHERE tenant_id = current_tenant_id()
           AND configuration_item_id = $1
           AND first_seen_at >= $2::timestamptz - interval '24 hours'
           AND first_seen_at <= $2::timestamptz + interval '1 hour'
         ORDER BY first_seen_at DESC
         LIMIT 8`,
        [incident.configuration_item_id, anchor],
      );
      const changes = await client.query(
        `SELECT c.id, c.number, c.title, c.scheduled_start
         FROM changes c
         JOIN change_cis cc ON cc.change_id = c.id AND cc.tenant_id = c.tenant_id
         WHERE c.tenant_id = current_tenant_id()
           AND cc.ci_id = $1
           AND c.status NOT IN ('cancelled', 'rejected', 'draft')
           AND c.scheduled_start IS NOT NULL
           AND c.scheduled_start <= $2::timestamptz + interval '1 hour'
           AND (c.scheduled_end IS NULL OR c.scheduled_end >= $2::timestamptz - interval '1 hour')
         ORDER BY c.scheduled_start DESC
         LIMIT 8`,
        [incident.configuration_item_id, anchor],
      );
      const alertHints: CorrelationHint[] = (alerts.rows as Array<{
        id: string; number: string; title: string; severity: string; first_seen_at: string;
      }>).map((row) => ({
        source: 'alert',
        summary: `${row.number} ${row.title} (${row.severity})`,
        confidence: 0.6,
        relatedEntityType: 'alert',
        relatedEntityId: row.id,
        occurredAt: row.first_seen_at,
      }));
      const changeHints: CorrelationHint[] = (changes.rows as Array<{
        id: string; number: string; title: string; scheduled_start: string;
      }>).map((row) => ({
        source: 'change',
        summary: `${row.number} ${row.title}`,
        confidence: 0.5,
        relatedEntityType: 'change',
        relatedEntityId: row.id,
        occurredAt: row.scheduled_start,
      }));
      return [...alertHints, ...changeHints];
    },
  };
}
