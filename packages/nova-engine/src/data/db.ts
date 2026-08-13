/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Database Wrapper ───
// Thin wrapper around pg.Pool with tenant-context helpers.

import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config';
import { logger } from '../logger';

type TenantClientStore = { client: PoolClient };
const tenantAls = new AsyncLocalStorage<TenantClientStore>();

export const CLEAR_TENANT_CONTEXT_SQL = `SELECT set_config('app.current_tenant_id', '', false),
            set_config('app.current_user_id', '', false),
            set_config('app.current_user_roles', '', false)`;

export type PgRoleBypassFlags = {
  rolsuper: boolean;
  rolbypassrls: boolean;
};

/** Superusers and BYPASSRLS roles ignore FORCE ROW LEVEL SECURITY. */
export function roleBypassesRls(role: PgRoleBypassFlags): boolean {
  return role.rolsuper === true || role.rolbypassrls === true;
}

export type SchemaCompatibilityCheck = {
  ok: boolean;
  expectedVersion: string;
  actualVersion: string | null;
  reason:
    | 'match'
    | 'older_than_expected'
    | 'newer_than_expected'
    | 'no_migrations'
    | 'migration_table_missing'
    | 'invalid_expected_version'
    | 'invalid_actual_version'
    | 'check_failed';
  errorCode?: string;
};

type SchemaVersionRow = { version: string };
const SCHEMA_VERSION_PATTERN = /^v\d{2}\.\d{2}\.\d{2}$/;

function isSchemaVersion(value: string): boolean {
  return SCHEMA_VERSION_PATTERN.test(value);
}

function compareSchemaVersions(a: string, b: string): number {
  const aParts = a.slice(1).split('.').map((part) => Number.parseInt(part, 10));
  const bParts = b.slice(1).split('.').map((part) => Number.parseInt(part, 10));
  for (let idx = 0; idx < 3; idx += 1) {
    if (aParts[idx] > bParts[idx]) return 1;
    if (aParts[idx] < bParts[idx]) return -1;
  }
  return 0;
}

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
});

// ─── Public API ───

function activeQueryable(): Pool | PoolClient {
  return tenantAls.getStore()?.client ?? pool;
}

/** Run a single parameterized query. Uses the request-scoped client when set. */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await activeQueryable().query<T>(text, params);
  const duration = Date.now() - start;
  logger.debug({ query: text.slice(0, 80), duration, rows: result.rowCount }, 'db.query');
  return result;
}

/** Get a single row or null. */
export async function getOne<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}

/** Get multiple rows. */
export async function getMany<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

/** Set the tenant context for RLS before running queries in a request. */
export async function setTenantContext(
  client: PoolClient,
  tenantId: string,
  userId: string,
  userRoles: string,
): Promise<void> {
  // Use set_config with false = session-level (persists on this connection).
  // Using true would be transaction-local and get discarded without BEGIN/COMMIT.
  await client.query(
    `SELECT set_config('app.current_tenant_id', $1, false),
            set_config('app.current_user_id', $2, false),
            set_config('app.current_user_roles', $3, false)`,
    [tenantId, userId, userRoles],
  );
}

export async function clearTenantContext(client: PoolClient): Promise<void> {
  await client.query(CLEAR_TENANT_CONTEXT_SQL);
}

/** Bind a checked-out client to async continuation (Express next()). */
export function bindRequestClient(client: PoolClient, next: () => void): void {
  tenantAls.run({ client }, next);
}

async function withScopedClient<T>(
  tenantId: string,
  userId: string,
  userRoles: string,
  beginTransaction: boolean,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    if (beginTransaction) await client.query('BEGIN');
    await setTenantContext(client, tenantId, userId, userRoles);
    const result = await tenantAls.run({ client }, () => fn(client));
    if (beginTransaction) await client.query('COMMIT');
    return result;
  } catch (err) {
    if (beginTransaction) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback failures on a dead connection
      }
    }
    throw err;
  } finally {
    try {
      await clearTenantContext(client);
    } catch {
      // ignore – connection may already be broken
    }
    client.release();
  }
}

/** Run a callback on a dedicated client with tenant context (no transaction). */
export async function withTenantContext<T>(
  tenantId: string,
  userId: string,
  userRoles: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withScopedClient(tenantId, userId, userRoles, false, fn);
}

/** Run a callback inside a transaction with tenant context set. */
export async function withTenantTransaction<T>(
  tenantId: string,
  userId: string,
  userRole: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withScopedClient(tenantId, userId, userRole, true, fn);
}

/** Get a raw client from the pool (caller must release). */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

/** Health check – can we reach the database? */
export async function healthCheck(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/** Refuse to start if the connected role can silently bypass RLS. */
export async function assertRuntimeRoleCannotBypassRls(): Promise<void> {
  const result = await pool.query<PgRoleBypassFlags>(
    'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Connected database role was not found in pg_roles');
  }
  if (roleBypassesRls(row)) {
    throw new Error(
      `Database role "${config.db.user}" is superuser and/or BYPASSRLS. `
      + 'Nova Suite must connect as POSTGRES_APP_USER (nova_runtime), not POSTGRES_USER. '
      + 'FORCE ROW LEVEL SECURITY does not apply to superusers.',
    );
  }
}

/** Get latest schema migration version from DB. */
export async function getLatestSchemaVersion(): Promise<string | null> {
  const row = await getOne<SchemaVersionRow>(
    'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1',
  );
  return row?.version ?? null;
}

/** Compare DB schema version to application expected version. */
export async function checkSchemaCompatibility(expectedVersion: string): Promise<SchemaCompatibilityCheck> {
  if (!isSchemaVersion(expectedVersion)) {
    return {
      ok: false,
      expectedVersion,
      actualVersion: null,
      reason: 'invalid_expected_version',
    };
  }

  try {
    const actualVersion = await getLatestSchemaVersion();
    if (actualVersion === null) {
      return {
        ok: false,
        expectedVersion,
        actualVersion: null,
        reason: 'no_migrations',
      };
    }
    if (!isSchemaVersion(actualVersion)) {
      return {
        ok: false,
        expectedVersion,
        actualVersion,
        reason: 'invalid_actual_version',
      };
    }

    if (actualVersion === expectedVersion) {
      return {
        ok: true,
        expectedVersion,
        actualVersion,
        reason: 'match',
      };
    }

    return {
      ok: false,
      expectedVersion,
      actualVersion,
      reason: compareSchemaVersions(actualVersion, expectedVersion) < 0
        ? 'older_than_expected'
        : 'newer_than_expected',
    };
  } catch (err) {
    const code = typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : undefined;
    if (code === '42P01') {
      return {
        ok: false,
        expectedVersion,
        actualVersion: null,
        reason: 'migration_table_missing',
        errorCode: code,
      };
    }

    logger.error({ err, expectedVersion }, 'Failed to check schema compatibility');
    return {
      ok: false,
      expectedVersion,
      actualVersion: null,
      reason: 'check_failed',
      errorCode: code,
    };
  }
}

/** Graceful shutdown. */
export async function shutdown(): Promise<void> {
  await pool.end();
  logger.info('Database pool closed');
}

export const db = {
  query,
  getOne,
  getMany,
  getClient,
  setTenantContext,
  clearTenantContext,
  bindRequestClient,
  withTenantContext,
  withTenantTransaction,
  healthCheck,
  assertRuntimeRoleCannotBypassRls,
  getLatestSchemaVersion,
  checkSchemaCompatibility,
  shutdown,
};
