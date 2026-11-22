/* SPDX-License-Identifier: AGPL-3.0-only */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  TENANT_A,
  TENANT_B,
  USER_A,
  USER_B,
  adminClient,
  runtimeClient,
  setTenantContext,
} from './pg';

describe('postgres RLS (integration)', () => {
  const admin = adminClient();
  const runtime = runtimeClient();

  beforeAll(async () => {
    await admin.connect();
    await runtime.connect();

    await admin.query(
      `INSERT INTO tenants (id, name, slug)
       VALUES ($1, 'CI Tenant B', 'ci-tenant-b')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT_B],
    );

    // Seed one department per tenant as the bootstrap role (bypasses RLS).
    await admin.query(
      `INSERT INTO departments (id, tenant_id, name, description)
       VALUES
         ('a1000000-0000-0000-0000-00000000c001', $1, 'CI Dept A', 'integration'),
         ('b1000000-0000-0000-0000-00000000c001', $2, 'CI Dept B', 'integration')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT_A, TENANT_B],
    );
  });

  afterAll(async () => {
    await runtime.end().catch(() => undefined);
    await admin.end().catch(() => undefined);
  });

  it('connects as nova_runtime without BYPASSRLS', async () => {
    const { rows } = await runtime.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      current_user: string;
    }>(
      `SELECT current_user,
              rolsuper,
              rolbypassrls
       FROM pg_roles
       WHERE rolname = current_user`,
    );
    expect(rows[0]?.current_user).toBe(process.env.POSTGRES_APP_USER || 'nova_runtime');
    expect(rows[0]?.rolsuper).toBe(false);
    expect(rows[0]?.rolbypassrls).toBe(false);
  });

  it('hides other tenants departments from the runtime role', async () => {
    await setTenantContext(runtime, TENANT_A, USER_A, 'admin');
    const a = await runtime.query<{ name: string }>(
      `SELECT name FROM departments WHERE name LIKE 'CI Dept %' ORDER BY name`,
    );
    expect(a.rows.map((r) => r.name)).toEqual(['CI Dept A']);

    await setTenantContext(runtime, TENANT_B, USER_B, 'admin');
    const b = await runtime.query<{ name: string }>(
      `SELECT name FROM departments WHERE name LIKE 'CI Dept %' ORDER BY name`,
    );
    expect(b.rows.map((r) => r.name)).toEqual(['CI Dept B']);
  });

  it('blocks cross-tenant incident reads for fulfillers', async () => {
    const incidentId = 'c1000000-0000-0000-0000-00000000f001';

    await admin.query(
      `INSERT INTO incidents (id, tenant_id, number, title, status, impact, urgency, priority)
       VALUES ($1, $2, 'INC-CI-0001', 'CI tenant A incident', 'new', 'low', 'low', 5)
       ON CONFLICT (id) DO NOTHING`,
      [incidentId, TENANT_A],
    );

    await setTenantContext(runtime, TENANT_A, USER_A, 'fulfiller');
    const visible = await runtime.query(
      `SELECT id FROM incidents WHERE id = $1`,
      [incidentId],
    );
    expect(visible.rowCount).toBe(1);

    await setTenantContext(runtime, TENANT_B, USER_B, 'fulfiller');
    const hidden = await runtime.query(
      `SELECT id FROM incidents WHERE id = $1`,
      [incidentId],
    );
    expect(hidden.rowCount).toBe(0);
  });

  it('records schema_migrations through the latest expected version', async () => {
    const expected = process.env.DB_SCHEMA_VERSION || 'v00.01.49';
    const { rows } = await admin.query<{ version: string }>(
      `SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`,
    );
    expect(rows[0]?.version).toBe(expected);
  });
});
