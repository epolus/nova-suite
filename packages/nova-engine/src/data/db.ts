/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Database Wrapper ───
// Thin wrapper around pg.Pool with tenant-context helpers.

import { AsyncLocalStorage } from 'node:async_hooks';
import {
  assertRuntimeRoleCannotBypassRls as assertRoleCannotBypassRls,
  checkSchemaCompatibility as checkSchema,
  type SchemaCompatibilityCheck,
} from '@nova-suite/shared/node';
import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config';
import { logger } from '../logger';

type TenantClientStore = { client: PoolClient };
const tenantAls = new AsyncLocalStorage<TenantClientStore>();

export const CLEAR_TENANT_CONTEXT_SQL = `SELECT set_config('app.current_tenant_id', '', false),
            set_config('app.current_user_id', '', false),
            set_config('app.current_user_roles', '', false)`;

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

export function assertRuntimeRoleCannotBypassRls(): Promise<void> {
  return assertRoleCannotBypassRls(pool, config.db.user);
}

export function checkSchemaCompatibility(expectedVersion: string): Promise<SchemaCompatibilityCheck> {
  return checkSchema(pool, expectedVersion, (err) => {
    logger.error({ err, expectedVersion }, 'Failed to check schema compatibility');
  });
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
  checkSchemaCompatibility,
  shutdown,
};
