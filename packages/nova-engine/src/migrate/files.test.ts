/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import {
  auditChecksums,
  listMigrationFiles,
  migrationChecksum,
  parseMigrationFilename,
  pendingMigrations,
} from './files';

describe('migrationChecksum', () => {
  it('ignores CRLF vs LF line endings', () => {
    expect(migrationChecksum('SELECT 1;\r\nSELECT 2;\r\n')).toBe(migrationChecksum('SELECT 1;\nSELECT 2;\n'));
  });

  it('changes when content changes', () => {
    expect(migrationChecksum('SELECT 1;')).not.toBe(migrationChecksum('SELECT 2;'));
  });
});

describe('auditChecksums', () => {
  const files = new Map([['v00.01.01', 'aaa'], ['v00.01.02', 'bbb']]);

  it('passes when recorded checksums match', () => {
    const audit = auditChecksums(
      [{ version: 'v00.01.01', checksum: 'aaa' }, { version: 'v00.01.02', checksum: 'bbb' }],
      files,
    );
    expect(audit).toEqual({ mismatched: [], unrecorded: [] });
  });

  it('reports edited files', () => {
    const audit = auditChecksums([{ version: 'v00.01.01', checksum: 'old' }], files);
    expect(audit.mismatched).toEqual(['v00.01.01']);
  });

  it('records missing checksums instead of failing', () => {
    const audit = auditChecksums([{ version: 'v00.01.02', checksum: null }], files);
    expect(audit).toEqual({ mismatched: [], unrecorded: ['v00.01.02'] });
  });

  it('re-records explicitly accepted versions', () => {
    const audit = auditChecksums([{ version: 'v00.01.01', checksum: 'old' }], files, new Set(['v00.01.01']));
    expect(audit).toEqual({ mismatched: [], unrecorded: ['v00.01.01'] });
  });

  it('ignores ledger rows without a file (pre-ledger history)', () => {
    const audit = auditChecksums([{ version: 'v00.01.00', checksum: null }], files);
    expect(audit).toEqual({ mismatched: [], unrecorded: [] });
  });
});

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
