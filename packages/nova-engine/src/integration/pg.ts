/* SPDX-License-Identifier: AGPL-3.0-only */
import { Client } from 'pg';

export const TENANT_A = 'a0000000-0000-0000-0000-000000000001';
export const TENANT_B = 'b0000000-0000-0000-0000-000000000001';
export const USER_A = 'a0000000-0000-0000-0000-0000000000aa';
export const USER_B = 'b0000000-0000-0000-0000-0000000000bb';

/** Seeded Acme users from infra/postgres/init.sql */
export const SEED_ADMIN = 'b0000000-0000-0000-0000-000000000001';
export const SEED_FULFILLER = 'b0000000-0000-0000-0000-000000000002';
export const SEED_USER = 'b0000000-0000-0000-0000-000000000003';
export const SEED_CHANGE_MGR = 'b0000000-0000-0000-0000-000000000008';

export const SEED_CHANGE_TYPE_NORMAL = 'a9000000-0000-0000-0000-000000000002';
/** Network Operations — linked to Change Management in seed data. */
export const SEED_CHANGE_GROUP = 'a5000000-0000-0000-0000-000000000002';
/** Service Desk — linked to Incident Management in seed data. */
export const SEED_INCIDENT_GROUP = 'a5000000-0000-0000-0000-000000000001';

function env(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`${name} is required for integration tests`);
}

export function adminClient(): Client {
  return new Client({
    host: env('POSTGRES_HOST', 'localhost'),
    port: Number.parseInt(env('POSTGRES_PORT', '5432'), 10),
    database: env('POSTGRES_DB', 'nova'),
    user: env('POSTGRES_USER', 'nova_app'),
    password: env('POSTGRES_PASSWORD'),
  });
}

export function runtimeClient(): Client {
  return new Client({
    host: env('POSTGRES_HOST', 'localhost'),
    port: Number.parseInt(env('POSTGRES_PORT', '5432'), 10),
    database: env('POSTGRES_DB', 'nova'),
    user: env('POSTGRES_APP_USER', 'nova_runtime'),
    password: env('POSTGRES_APP_PASSWORD', env('POSTGRES_PASSWORD')),
  });
}

export async function setTenantContext(
  client: Client,
  tenantId: string,
  userId: string,
  roles: string,
): Promise<void> {
  await client.query(
    `SELECT set_config('app.current_tenant_id', $1, false),
            set_config('app.current_user_id', $2, false),
            set_config('app.current_user_roles', $3, false)`,
    [tenantId, userId, roles],
  );
}
