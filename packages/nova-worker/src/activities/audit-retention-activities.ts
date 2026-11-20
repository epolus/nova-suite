/* SPDX-License-Identifier: AGPL-3.0-only */
import { config } from '../config';
import { query, withTenantContext } from '../db';
import { activityHeartbeat, throwIfActivityCancelled } from './activity-context';

/** Rows deleted per statement; keeps each DELETE under the statement timeout. */
export const AUDIT_RETENTION_CHUNK_SIZE = 5_000;
/** Safety cap so a runaway tenant cannot loop forever in one activity attempt. */
export const AUDIT_RETENTION_MAX_STEPS_PER_TENANT = 20_000;

export type AuditRetentionResult = {
  tenants: number;
  deleted: number;
  skipped: boolean;
};

export type AuditRetentionQueryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null }>;
};

export type AuditRetentionDeps = {
  retentionDays: number;
  chunkSize?: number;
  maxStepsPerTenant?: number;
  listTenants: () => Promise<Array<{ id: string }>>;
  withTenant: <T>(tenantId: string, fn: (client: AuditRetentionQueryable) => Promise<T>) => Promise<T>;
  heartbeat?: (detail?: unknown) => void;
  throwIfCancelled?: () => void;
  log?: (message: string) => void;
};

/** Pure helper for tests and the activity entry point. */
export function shouldSkipAuditRetention(retentionDays: number): boolean {
  return !Number.isFinite(retentionDays) || retentionDays <= 0;
}

export async function purgeAuditEventsWithDeps(deps: AuditRetentionDeps): Promise<AuditRetentionResult> {
  const {
    retentionDays,
    chunkSize = AUDIT_RETENTION_CHUNK_SIZE,
    maxStepsPerTenant = AUDIT_RETENTION_MAX_STEPS_PER_TENANT,
    listTenants,
    withTenant,
    heartbeat = activityHeartbeat,
    throwIfCancelled = throwIfActivityCancelled,
    log = (message) => console.log(message),
  } = deps;

  if (shouldSkipAuditRetention(retentionDays)) {
    return { tenants: 0, deleted: 0, skipped: true };
  }

  const tenants = await listTenants();
  let deleted = 0;

  for (const tenant of tenants) {
    throwIfCancelled();
    heartbeat({ tenantId: tenant.id, deleted });
    deleted += await withTenant(tenant.id, async (client) => {
      let tenantDeleted = 0;
      for (let step = 0; step < maxStepsPerTenant; step += 1) {
        throwIfCancelled();
        const result = await client.query(
          `DELETE FROM audit_events
           WHERE id IN (
             SELECT id FROM audit_events
             WHERE created_at < now() - ($1::int * interval '1 day')
             ORDER BY created_at
             LIMIT $2
           )`,
          [retentionDays, chunkSize],
        );
        const chunk = result.rowCount ?? 0;
        tenantDeleted += chunk;
        heartbeat({ tenantId: tenant.id, deleted: deleted + tenantDeleted, step });
        if (chunk < chunkSize) break;
        if (step === maxStepsPerTenant - 1) {
          throw new Error(
            `Audit retention exceeded chunk limit for tenant ${tenant.id} (${maxStepsPerTenant} steps)`,
          );
        }
      }
      return tenantDeleted;
    });
  }

  log(
    `[nova-worker] audit retention purged ${deleted} row(s) across ${tenants.length} tenant(s) (retentionDays=${retentionDays})`,
  );
  return { tenants: tenants.length, deleted, skipped: false };
}

export async function purgeAuditEventsForAllTenants(): Promise<AuditRetentionResult> {
  return purgeAuditEventsWithDeps({
    retentionDays: config.audit.retentionDays,
    listTenants: () => query<{ id: string }>('SELECT id FROM tenants'),
    withTenant: withTenantContext,
  });
}
