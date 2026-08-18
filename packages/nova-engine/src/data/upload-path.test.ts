/* SPDX-License-Identifier: AGPL-3.0-only */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertPathSegment,
  assertUuidParam,
  resolveUploadPath,
  safeAttachmentExtension,
  safeImageExtension,
  UnsafeUploadPathError,
} from './upload-path';

const ROOT = path.resolve('/var/nova/uploads');

describe('safeImageExtension', () => {
  it('keeps allowlisted suffixes', () => {
    expect(safeImageExtension('logo.PNG')).toBe('.png');
    expect(safeImageExtension('a.webp')).toBe('.webp');
  });

  it('falls back when the suffix is not an image', () => {
    expect(safeImageExtension('x.exe')).toBe('.jpg');
    expect(safeImageExtension('../etc/passwd')).toBe('.jpg');
  });
});

describe('safeAttachmentExtension', () => {
  it('keeps a short alphanumeric suffix', () => {
    expect(safeAttachmentExtension('report.PDF')).toBe('.pdf');
  });

  it('drops traversal and odd suffixes', () => {
    expect(safeAttachmentExtension('../etc/passwd')).toBe('');
    expect(safeAttachmentExtension('x.exe.sh')).toBe('.sh');
    expect(safeAttachmentExtension('no-ext')).toBe('');
  });
});

describe('assertPathSegment', () => {
  it('accepts entity types', () => {
    expect(assertPathSegment('knowledge_article')).toBe('knowledge_article');
  });

  it('rejects traversal', () => {
    expect(() => assertPathSegment('../etc')).toThrow(UnsafeUploadPathError);
    expect(() => assertPathSegment('a/b')).toThrow(UnsafeUploadPathError);
  });
});

describe('assertUuidParam', () => {
  it('accepts a uuid', () => {
    expect(assertUuidParam('d0000000-0000-0000-0000-000000000001')).toBe(
      'd0000000-0000-0000-0000-000000000001',
    );
  });

  it('rejects path segments', () => {
    expect(() => assertUuidParam('../etc')).toThrow(UnsafeUploadPathError);
  });
});

describe('resolveUploadPath', () => {
  it('joins a relative key under the root', () => {
    const resolved = resolveUploadPath(ROOT, 'catalog/abc/file.jpg');
    expect(resolved.startsWith(ROOT + path.sep)).toBe(true);
    expect(resolved.endsWith(`${path.sep}catalog${path.sep}abc${path.sep}file.jpg`)).toBe(true);
  });

  it('rejects traversal and absolute keys', () => {
    expect(() => resolveUploadPath(ROOT, '../secret')).toThrow(UnsafeUploadPathError);
    expect(() => resolveUploadPath(ROOT, '/etc/passwd')).toThrow(UnsafeUploadPathError);
    expect(() => resolveUploadPath(ROOT, 'catalog/../../etc/passwd')).toThrow(UnsafeUploadPathError);
    expect(() => resolveUploadPath(ROOT, 'catalog//file.jpg')).toThrow(UnsafeUploadPathError);
  });
});
