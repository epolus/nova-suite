/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { listMigrationFiles, parseMigrationFilename, pendingMigrations } from './files';

describe('parseMigrationFilename', () => {
  it('parses a valid versioned filename', () => {
    expect(parseMigrationFilename('v00.01.01__add_request_due_date.sql')).toEqual({
      version: 'v00.01.01',
      name: 'v00.01.01__add_request_due_date',
      filename: 'v00.01.01__add_request_due_date.sql',
    });
  });

  it('rejects missing double-underscore slug', () => {
    expect(parseMigrationFilename('v00.01.01.sql')).toBeNull();
  });

  it('rejects unpadded versions', () => {
    expect(parseMigrationFilename('v0.1.1__x.sql')).toBeNull();
  });
});

describe('listMigrationFiles', () => {
  it('sorts by version and ignores non-sql names', () => {
    const files = listMigrationFiles([
      'README',
      'v00.02.00__later.sql',
      'v00.01.01__first.sql',
    ]);
    expect(files.map((file) => file.version)).toEqual(['v00.01.01', 'v00.02.00']);
  });

  it('rejects duplicate versions', () => {
    expect(() => listMigrationFiles([
      'v00.01.01__a.sql',
      'v00.01.01__b.sql',
    ])).toThrow(/Duplicate migration version v00.01.01/);
  });

  it('rejects sql files that do not match the pattern', () => {
    expect(() => listMigrationFiles(['001_initial.sql'])).toThrow(/Invalid migration filename/);
  });
});

describe('pendingMigrations', () => {
  const files = listMigrationFiles([
    'v00.01.01__a.sql',
    'v00.01.02__b.sql',
    'v00.02.00__c.sql',
  ]);

  it('returns every file when the ledger is empty', () => {
    expect(pendingMigrations(files, null).map((file) => file.version)).toEqual([
      'v00.01.01',
      'v00.01.02',
      'v00.02.00',
    ]);
  });

  it('skips versions already at or below the ledger', () => {
    expect(pendingMigrations(files, 'v00.01.01').map((file) => file.version)).toEqual([
      'v00.01.02',
      'v00.02.00',
    ]);
  });

  it('returns nothing when the ledger is current', () => {
    expect(pendingMigrations(files, 'v00.02.00')).toEqual([]);
  });
});
