/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { createFakeServiceNow } from '@nova-suite/shared/node';
import { createServiceNowMigrationActivities } from './servicenow-migration-activities';

type Run = Record<string, unknown> & { progress: Record<string, unknown> };

function fakeDb(run: Run) {
  const queries: string[] = [];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push(sql.replace(/\s+/g, ' ').trim());
      if (sql.startsWith('SELECT instance_url')) return { rows: [run] };
      if (sql.startsWith('SELECT snapshot')) return { rows: [{ snapshot: run.snapshot }] };
      if (sql.includes('SET status = $2, progress')) {
        run.status = params[1];
        run.progress = { ...run.progress, ...JSON.parse(String(params[2])) };
      } else if (sql.includes('SET snapshot')) {
        run.snapshot = JSON.parse(String(params[1]));
      } else if (sql.includes('SET package')) {
        Object.assign(run, { package: JSON.parse(String(params[1])), report: JSON.parse(String(params[2])), status: 'ready' });
      } else if (sql.includes("SET status = 'failed'")) {
        Object.assign(run, { status: 'failed', error: params[1] });
      }
      return { rows: [] };
    },
  } as unknown as PoolClient;
  const tenants: string[] = [];
  const withTenant = async <T>(tenantId: string, fn: (c: PoolClient) => Promise<T>) => {
    tenants.push(tenantId);
    return fn(client);
  };
  return { withTenant, queries, tenants };
}

const TABLES = {
  sys_properties: [],
  sc_catalog: [{ sys_id: 'cat', title: 'Service Catalog', active: 'true' }],
  sc_category: [{ sys_id: 'hw', title: 'Hardware', sc_catalog: 'cat', active: 'true' }],
  sc_cat_item: [{ sys_id: 'i1', name: 'Monitor', category: 'hw', active: 'true', sys_class_name: 'sc_cat_item' }],
  item_option_new: [{ sys_id: 'v1', name: 'size', question_text: 'Size', type: '6', cat_item: 'i1', active: 'true' }],
  item_option_new_set: [],
  io_set_item: [],
  question_choice: [],
};

const input = { runId: 'run-1', tenantId: 'tenant-1' };

function setup(secret: string | undefined, fake = createFakeServiceNow(TABLES)) {
  const run: Run = { instance_url: 'https://acme.service-now.com', credential_slug: 'sn_prod', options: {}, status: 'queued', progress: {} };
  const db = fakeDb(run);
  const heartbeats: unknown[] = [];
  const activities = createServiceNowMigrationActivities({
    withTenant: db.withTenant,
    loadSecret: async () => secret,
    fetchImpl: fake.fetch,
    schemaVersion: 'v00.01.23',
    heartbeat: (d) => heartbeats.push(d),
  });
  return { run, db, heartbeats, activities, fake };
}

describe('ServiceNow migration activities', () => {
  it('extracts and transforms a run end to end', async () => {
    const { run, db, heartbeats, activities } = setup('svc:pw');
    const extracted = await activities.extractServiceNowMigrationSnapshot(input);
    expect(extracted).toMatchObject({ items: 1, flows: 0 });
    expect(run.status).toBe('transforming');
    expect(run.progress).toMatchObject({ stage: 'extracted', extracted: { items: 1 } });
    expect(heartbeats.length).toBeGreaterThan(0);
    expect(db.tenants.every((t) => t === 'tenant-1')).toBe(true);

    const transformed = await activities.transformServiceNowMigrationSnapshot(input);
    expect(transformed).toMatchObject({ items: 1, unsupported: 0 });
    expect(run.status).toBe('ready');
    const pkg = run.package as { format: string; contents: { catalog: { service_items: Array<{ name: string }> } } };
    expect(pkg.format).toBe('nova.config-package');
    expect(pkg.contents.catalog.service_items.map((i) => i.name)).toEqual(['Monitor']);
  });

  it('fails non-retryably when the credential is missing or invalid', async () => {
    await expect(setup(undefined).activities.extractServiceNowMigrationSnapshot(input))
      .rejects.toMatchObject({ type: 'CredentialMissing', nonRetryable: true });
    await expect(setup('garbage').activities.extractServiceNowMigrationSnapshot(input))
      .rejects.toMatchObject({ type: 'CredentialInvalid', nonRetryable: true });
  });

  it('fails non-retryably on ServiceNow 401', async () => {
    const fake = createFakeServiceNow(TABLES, { expectAuthHeader: { name: 'authorization', value: 'nope' } });
    await expect(setup('svc:pw', fake).activities.extractServiceNowMigrationSnapshot(input))
      .rejects.toMatchObject({ type: 'ServiceNowAccessDenied', nonRetryable: true });
  });

  it('records failures', async () => {
    const { run, activities } = setup('svc:pw');
    await activities.failServiceNowMigration({ ...input, error: 'boom' });
    expect(run).toMatchObject({ status: 'failed', error: 'boom' });
  });

  it('refuses to transform without a snapshot', async () => {
    await expect(setup('svc:pw').activities.transformServiceNowMigrationSnapshot(input))
      .rejects.toMatchObject({ type: 'SnapshotMissing' });
  });
});
