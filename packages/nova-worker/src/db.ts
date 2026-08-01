/* SPDX-License-Identifier: AGPL-3.0-only */
import { Pool, PoolClient } from 'pg';
import { config } from './config';

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

export async function heartbeat(workerName: string): Promise<void> {
  await pool.query(
    `INSERT INTO worker_heartbeats (worker_name, last_seen_at)
     VALUES ($1, now())
     ON CONFLICT (worker_name)
     DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
    [workerName],
  );
}

export async function getLatestSchemaVersion(): Promise<string | null> {
  const rows = await query<SchemaVersionRow>(
    'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1',
  );
  return rows[0]?.version ?? null;
}

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

    return {
      ok: false,
      expectedVersion,
      actualVersion: null,
      reason: 'check_failed',
      errorCode: code,
    };
  }
}
