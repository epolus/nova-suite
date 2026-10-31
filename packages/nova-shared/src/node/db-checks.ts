/* SPDX-License-Identifier: AGPL-3.0-only */

/** Minimal structural subset of pg `Pool` / `PoolClient`. */
export type Queryable = {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
};

export type PgRoleBypassFlags = {
  rolsuper: boolean;
  rolbypassrls: boolean;
};

/** Superusers and BYPASSRLS roles ignore FORCE ROW LEVEL SECURITY. */
export function roleBypassesRls(role: PgRoleBypassFlags): boolean {
  return role.rolsuper === true || role.rolbypassrls === true;
}

/** Refuse to start if the connected role can silently bypass RLS. */
export async function assertRuntimeRoleCannotBypassRls(db: Queryable, dbUser: string): Promise<void> {
  const result = await db.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
  const row = result.rows[0] as PgRoleBypassFlags | undefined;
  if (!row) {
    throw new Error('Connected database role was not found in pg_roles');
  }
  if (roleBypassesRls(row)) {
    throw new Error(
      `Database role "${dbUser}" is superuser and/or BYPASSRLS. `
      + 'Nova Suite must connect as POSTGRES_APP_USER (nova_runtime), not POSTGRES_USER. '
      + 'FORCE ROW LEVEL SECURITY does not apply to superusers.',
    );
  }
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

const SCHEMA_VERSION_PATTERN = /^v\d{2}\.\d{2}\.\d{2}$/;

function compareSchemaVersions(a: string, b: string): number {
  const aParts = a.slice(1).split('.').map((part) => Number.parseInt(part, 10));
  const bParts = b.slice(1).split('.').map((part) => Number.parseInt(part, 10));
  for (let idx = 0; idx < 3; idx += 1) {
    if (aParts[idx] > bParts[idx]) return 1;
    if (aParts[idx] < bParts[idx]) return -1;
  }
  return 0;
}

/** Compare DB schema version to application expected version. */
export async function checkSchemaCompatibility(
  db: Queryable,
  expectedVersion: string,
  onError?: (err: unknown) => void,
): Promise<SchemaCompatibilityCheck> {
  const fail = (
    reason: SchemaCompatibilityCheck['reason'],
    actualVersion: string | null = null,
    errorCode?: string,
  ): SchemaCompatibilityCheck => ({ ok: false, expectedVersion, actualVersion, reason, errorCode });

  if (!SCHEMA_VERSION_PATTERN.test(expectedVersion)) return fail('invalid_expected_version');

  try {
    const result = await db.query('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
    const actualVersion = (result.rows[0] as { version: string } | undefined)?.version ?? null;
    if (actualVersion === null) return fail('no_migrations');
    if (!SCHEMA_VERSION_PATTERN.test(actualVersion)) return fail('invalid_actual_version', actualVersion);
    if (actualVersion === expectedVersion) {
      return { ok: true, expectedVersion, actualVersion, reason: 'match' };
    }
    return fail(
      compareSchemaVersions(actualVersion, expectedVersion) < 0 ? 'older_than_expected' : 'newer_than_expected',
      actualVersion,
    );
  } catch (err) {
    const code = typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : undefined;
    if (code === '42P01') return fail('migration_table_missing', null, code);
    onError?.(err);
    return fail('check_failed', null, code);
  }
}
