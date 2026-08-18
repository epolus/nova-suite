/* SPDX-License-Identifier: AGPL-3.0-only */
import path from 'node:path';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH_SEGMENT_RE = /^[a-z][a-z0-9_]{0,63}$/;

export class UnsafeUploadPathError extends Error {
  constructor(message = 'Invalid storage path') {
    super(message);
    this.name = 'UnsafeUploadPathError';
  }
}

/**
 * Map a user-supplied filename to a constant image suffix.
 * Returns a literal so the result is not treated as tainted input.
 */
export function safeImageExtension(filename: string, fallback = '.jpg'): string {
  switch (path.extname(path.basename(filename)).toLowerCase()) {
    case '.jpg':
      return '.jpg';
    case '.jpeg':
      return '.jpeg';
    case '.png':
      return '.png';
    case '.gif':
      return '.gif';
    case '.webp':
      return '.webp';
    case '.svg':
      return '.svg';
    default:
      return fallback;
  }
}

/** Keep a short alphanumeric suffix, or drop the extension. */
export function safeAttachmentExtension(filename: string): string {
  const ext = path.extname(path.basename(filename)).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

export function assertUuidParam(id: string): string {
  if (!UUID_RE.test(id)) {
    throw new UnsafeUploadPathError('Invalid id');
  }
  return id;
}

/** Single relative path segment (entity types such as `incident`). */
export function assertPathSegment(value: string, label = 'path segment'): string {
  if (!PATH_SEGMENT_RE.test(value)) {
    throw new UnsafeUploadPathError(`Invalid ${label}`);
  }
  return value;
}

/**
 * Resolve `storageKey` under the upload root. Rejects absolute keys,
 * `..` segments, and anything that would escape the root after normalize.
 */
export function resolveUploadPath(uploadDir: string, storageKey: string): string {
  if (!storageKey || storageKey.includes('\0') || path.isAbsolute(storageKey)) {
    throw new UnsafeUploadPathError();
  }
  if (storageKey.split(/[/\\]/).some((seg) => seg === '..' || seg === '')) {
    throw new UnsafeUploadPathError();
  }
  const root = path.resolve(uploadDir);
  const resolved = path.resolve(root, storageKey);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(prefix)) {
    throw new UnsafeUploadPathError();
  }
  const rel = path.relative(root, resolved);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new UnsafeUploadPathError();
  }
  return resolved;
}
