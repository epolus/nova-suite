/* SPDX-License-Identifier: AGPL-3.0-only */
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

export function loadMigrationFilenames(dir: string): string[] {
  return readdirSync(dir).filter((name) => !name.startsWith('.'));
}

export function migrationPath(dir: string, filename: string): string {
  return join(dir, filename);
}
