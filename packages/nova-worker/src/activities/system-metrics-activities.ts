/* SPDX-License-Identifier: AGPL-3.0-only */
import { query, withTenantContext } from '../db';

export async function snapshotDbSizeForAllTenants(): Promise<number> {
  const sizeRows = await query<{ total_bytes: string }>(
    'SELECT pg_database_size(current_database())::bigint::text AS total_bytes',
  );
  const totalBytes = Number(sizeRows[0]?.total_bytes || 0);
  if (!Number.isFinite(totalBytes) || totalBytes < 0) return 0;

  const tenants = await query<{ id: string }>('SELECT id FROM tenants');
  for (const tenant of tenants) {
    await withTenantContext(tenant.id, async (client) => {
      await client.query(
        `INSERT INTO system_metrics_db_size_snapshots (tenant_id, snapshot_at, total_bytes)
         VALUES ($1, date_trunc('hour', now()), $2)
         ON CONFLICT (tenant_id, snapshot_at)
         DO UPDATE SET total_bytes = EXCLUDED.total_bytes`,
        [tenant.id, totalBytes],
      );
    });
  }
  return tenants.length;
}
