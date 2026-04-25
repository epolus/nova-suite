/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Database Wrapper ───
// Thin wrapper around pg.Pool with tenant-context helpers.

import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config';
import { logger } from '../logger';

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

/** Run a single parameterized query. */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
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

/** Run a callback inside a transaction with tenant context set. */
export async function withTenantTransaction<T>(
  tenantId: string,
  userId: string,
  userRole: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenantId, userId, userRole);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Get a raw client from the pool (caller must release). */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

/** Health check – can we reach the database? */
export async function healthCheck(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
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
  withTenantTransaction,
  healthCheck,
  shutdown,
};
