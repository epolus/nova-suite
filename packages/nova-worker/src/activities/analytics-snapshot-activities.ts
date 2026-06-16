/* SPDX-License-Identifier: AGPL-3.0-only */
import { query, withTenantContext } from '../db';

/** Keep in sync with snapshot metrics in nova-engine/src/analytics/trendMetrics.ts */
const SNAPSHOT_METRICS: { dataset: string; metric: string; countSql: string }[] = [
  {
    dataset: 'incidents',
    metric: 'open_backlog',
    countSql: `SELECT count(*)::int AS value FROM incidents WHERE status NOT IN ('closed','cancelled')`,
  },
  {
    dataset: 'changes',
    metric: 'open_backlog',
    countSql: `SELECT count(*)::int AS value FROM changes WHERE status NOT IN ('closed','cancelled','rejected')`,
  },
  {
    dataset: 'requests',
    metric: 'open_backlog',
    countSql: `SELECT count(*)::int AS value FROM requests WHERE status NOT IN ('fulfilled','cancelled')`,
  },
];

export async function snapshotTrendMetricsForAllTenants(): Promise<number> {
  if (SNAPSHOT_METRICS.length === 0) return 0;

  const tenants = await query<{ id: string }>('SELECT id FROM tenants');
  for (const tenant of tenants) {
    await withTenantContext(tenant.id, async (client) => {
      for (const metric of SNAPSHOT_METRICS) {
        const countResult = await client.query<{ value: number | string }>(metric.countSql);
        const value = Number(countResult.rows[0]?.value ?? 0);

        await client.query(
          `INSERT INTO metric_snapshots (tenant_id, dataset, metric, snapshot_at, value)
           VALUES ($1, $2, $3, date_trunc('day', now()), $4)
           ON CONFLICT (tenant_id, dataset, metric, snapshot_at)
           DO UPDATE SET value = EXCLUDED.value`,
          [tenant.id, metric.dataset, metric.metric, value],
        );
      }
    });
  }

  return tenants.length * SNAPSHOT_METRICS.length;
}
