/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it, vi } from 'vitest';
import {
  purgeAuditEventsWithDeps,
  shouldSkipAuditRetention,
} from './audit-retention-activities';

describe('shouldSkipAuditRetention', () => {
  it('skips when days are zero or negative', () => {
    expect(shouldSkipAuditRetention(0)).toBe(true);
    expect(shouldSkipAuditRetention(-1)).toBe(true);
  });

  it('skips non-finite values', () => {
    expect(shouldSkipAuditRetention(Number.NaN)).toBe(true);
    expect(shouldSkipAuditRetention(Number.POSITIVE_INFINITY)).toBe(true);
  });

  it('runs when days are positive', () => {
    expect(shouldSkipAuditRetention(1)).toBe(false);
    expect(shouldSkipAuditRetention(365)).toBe(false);
  });
});

describe('purgeAuditEventsWithDeps', () => {
  it('returns skipped without listing tenants when retention is disabled', async () => {
    const listTenants = vi.fn(async () => [{ id: 't1' }]);
    const withTenant = vi.fn();
    const result = await purgeAuditEventsWithDeps({
      retentionDays: 0,
      listTenants,
      withTenant,
    });
    expect(result).toEqual({ tenants: 0, deleted: 0, skipped: true });
    expect(listTenants).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it('deletes in chunks until a short page and passes retention params', async () => {
    const deleteCounts = [5, 5, 2];
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params });
        return { rowCount: deleteCounts.shift() ?? 0 };
      },
    };
    const heartbeats: unknown[] = [];
    const logs: string[] = [];

    const result = await purgeAuditEventsWithDeps({
      retentionDays: 90,
      chunkSize: 5,
      listTenants: async () => [{ id: 'tenant-a' }],
      withTenant: async (_id, fn) => fn(client),
      heartbeat: (d) => heartbeats.push(d),
      log: (m) => logs.push(m),
    });

    expect(result).toEqual({ tenants: 1, deleted: 12, skipped: false });
    expect(queries).toHaveLength(3);
    expect(queries.every((q) => q.params[0] === 90 && q.params[1] === 5)).toBe(true);
    expect(queries[0]?.sql).toContain('DELETE FROM audit_events');
    expect(heartbeats.length).toBeGreaterThan(0);
    expect(logs[0]).toContain('purged 12 row(s)');
  });

  it('sums deletes across tenants', async () => {
    const client = {
      query: vi.fn(async () => ({ rowCount: 3, rows: [] })),
    };
    const result = await purgeAuditEventsWithDeps({
      retentionDays: 30,
      chunkSize: 10,
      listTenants: async () => [{ id: 't1' }, { id: 't2' }],
      withTenant: async (_id, fn) => fn(client),
      log: () => {},
    });
    expect(result).toEqual({ tenants: 2, deleted: 6, skipped: false });
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('throws when a tenant exceeds the chunk step limit', async () => {
    const client = {
      query: vi.fn(async () => ({ rowCount: 10, rows: [] })),
    };
    await expect(
      purgeAuditEventsWithDeps({
        retentionDays: 30,
        chunkSize: 10,
        maxStepsPerTenant: 2,
        listTenants: async () => [{ id: 'busy' }],
        withTenant: async (_id, fn) => fn(client),
        log: () => {},
      }),
    ).rejects.toThrow(/exceeded chunk limit for tenant busy/);
  });
});
