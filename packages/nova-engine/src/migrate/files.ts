/* SPDX-License-Identifier: AGPL-3.0-only */
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const MIGRATION_FILENAME = /^v(\d{2}\.\d{2}\.\d{2})__.+\.sql$/;

export type MigrationFile = {
  version: string;
  name: string;
  filename: string;
};

export function parseMigrationFilename(filename: string): MigrationFile | null {
  const match = MIGRATION_FILENAME.exec(filename);
  if (!match) return null;
  return {
    version: `v${match[1]}`,
    name: filename.replace(/\.sql$/i, ''),
    filename,
  };
}

export function listMigrationFiles(filenames: string[]): MigrationFile[] {
  const sqlFiles = filenames.filter((name) => name.endsWith('.sql'));
  const seen = new Map<string, string>();
  const parsed: MigrationFile[] = [];

  for (const filename of sqlFiles) {
    const file = parseMigrationFilename(filename);
    if (!file) {
      throw new Error(`Invalid migration filename: ${filename}`);
    }
    const previous = seen.get(file.version);
    if (previous) {
      throw new Error(`Duplicate migration version ${file.version}: ${previous} and ${filename}`);
    }
    seen.set(file.version, filename);
    parsed.push(file);
  }

  parsed.sort((a, b) => a.version.localeCompare(b.version));
  return parsed;
}

export function pendingMigrations(
  files: MigrationFile[],
  currentVersion: string | null,
): MigrationFile[] {
  if (currentVersion === null) return files;
  return files.filter((file) => file.version > currentVersion);
}

/** sha256 of the file with line endings normalized, so CRLF checkouts match. */
export function migrationChecksum(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

export type AppliedMigration = { version: string; checksum: string | null };

export type ChecksumAudit = {
  /** Applied versions whose file changed since it was applied. */
  mismatched: string[];
  /** Applied versions with no recorded checksum yet (recorded from the current file). */
  unrecorded: string[];
};

export function auditChecksums(
  applied: AppliedMigration[],
  fileChecksums: Map<string, string>,
  accepted: ReadonlySet<string> = new Set(),
): ChecksumAudit {
  const audit: ChecksumAudit = { mismatched: [], unrecorded: [] };
  for (const row of applied) {
    const current = fileChecksums.get(row.version);
    if (current === undefined) continue;
    if (row.checksum === null || accepted.has(row.version)) {
      if (row.checksum !== current) audit.unrecorded.push(row.version);
    } else if (row.checksum !== current) {
      audit.mismatched.push(row.version);
    }
  }
  return audit;
}

export function loadMigrationFilenames(dir: string): string[] {
  return readdirSync(dir).filter((name) => !name.startsWith('.'));
}

export function migrationPath(dir: string, filename: string): string {
  return join(dir, filename);
}
