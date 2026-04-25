/* SPDX-License-Identifier: AGPL-3.0-only */
import { Pool, PoolClient } from 'pg';
import { config } from './config';

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 5,
  idleTimeoutMillis: 30_000,
});

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function withTenantContext<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(
      `SELECT set_config('app.current_tenant_id', $1::text, false),
              set_config('app.current_user_id', '00000000-0000-0000-0000-000000000000', false),
              set_config('app.current_user_roles', 'system', false)`,
      [tenantId],
    );
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function shutdown(): Promise<void> {
  await pool.end();
}
