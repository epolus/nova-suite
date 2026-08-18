/* SPDX-License-Identifier: AGPL-3.0-only */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import {
  listMigrationFiles,
  loadMigrationFilenames,
  migrationPath,
  pendingMigrations,
} from './migrate/files';

const ADVISORY_LOCK_KEY = 872614001;
const SCHEMA_MIGRATIONS_MISSING = '42P01';

function env(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`${name} is required`);
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pgErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return String((err as { code: unknown }).code);
  }
  return undefined;
}

async function assertCanRunDdl(client: Client, user: string): Promise<void> {
  const result = await client.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Connected database role "${user}" was not found in pg_roles`);
  }
  if (row.rolsuper !== true && row.rolbypassrls !== true) {
    throw new Error(
      `Migration role "${user}" cannot run DDL (NOSUPERUSER NOBYPASSRLS). `
      + 'nova-migrate must connect as POSTGRES_USER, not POSTGRES_APP_USER.',
    );
  }
}

async function latestSchemaVersion(client: Client): Promise<string | null> {
  try {
    const result = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1',
    );
    return result.rows[0]?.version ?? null;
  } catch (err) {
    if (pgErrorCode(err) === SCHEMA_MIGRATIONS_MISSING) {
      throw new Error(
        'schema_migrations table is missing; this is not a Nova database. '
        + 'Empty volumes are initialized by init.sql, not by this job.',
      );
    }
    throw err;
  }
}

export async function runMigrations(): Promise<void> {
  const user = env('POSTGRES_USER', 'nova_app');
  const migrationsDir = env('NOVA_MIGRATIONS_DIR', '/app/infra/postgres/migrations');
  const files = listMigrationFiles(loadMigrationFilenames(migrationsDir));

  const client = new Client({
    host: env('POSTGRES_HOST', 'localhost'),
    port: envInt('POSTGRES_PORT', 5432),
    database: env('POSTGRES_DB', 'nova'),
    user,
    password: env('POSTGRES_PASSWORD', 'changeme'),
  });

  await client.connect();
  try {
    await assertCanRunDdl(client, user);
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    try {
      const currentVersion = await latestSchemaVersion(client);
      const pending = pendingMigrations(files, currentVersion);
      if (pending.length === 0) {
        console.log(`[nova-migrate] Schema is up to date (${currentVersion ?? 'empty ledger'})`);
        return;
      }

      for (const file of pending) {
        const sql = readFileSync(migrationPath(migrationsDir, file.filename), 'utf8');
        console.log(`[nova-migrate] Applying ${file.filename}`);
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query(
            'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
            [file.version, file.name],
          );
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }
      }

      const applied = pending.map((file) => file.version).join(', ');
      console.log(`[nova-migrate] Applied ${pending.length} migration(s): ${applied}`);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runMigrations().catch((err) => {
    console.error('[nova-migrate] Failed', err);
    process.exit(1);
  });
}
