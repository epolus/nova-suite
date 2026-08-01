/* SPDX-License-Identifier: AGPL-3.0-only */
type DiffChange = {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  before?: unknown;
  after?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStableString(value: unknown): string {
  try {
    return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort(), 2);
  } catch {
    return JSON.stringify(value);
  }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return false;
  if (Array.isArray(a) && Array.isArray(b)) return toStableString(a) === toStableString(b);
  if (isObject(a) && isObject(b)) return toStableString(a) === toStableString(b);
  return false;
}

export function diffObjects(
  before: unknown,
  after: unknown,
  basePath = '',
): DiffChange[] {
  if (valuesEqual(before, after)) return [];

  if (Array.isArray(before) || Array.isArray(after)) {
    if (!valuesEqual(before, after)) {
      return [{ path: basePath || '(root)', kind: 'changed', before, after }];
    }
    return [];
  }

  if (isObject(before) && isObject(after)) {
    const changes: DiffChange[] = [];
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      const nextPath = basePath ? `${basePath}.${key}` : key;
      const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
      const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
      if (!hasBefore && hasAfter) {
        changes.push({ path: nextPath, kind: 'added', after: after[key] });
        continue;
      }
      if (hasBefore && !hasAfter) {
        changes.push({ path: nextPath, kind: 'removed', before: before[key] });
        continue;
      }
      changes.push(...diffObjects(before[key], after[key], nextPath));
    }
    return changes;
  }

  return [{ path: basePath || '(root)', kind: 'changed', before, after }];
}

export function formatDiffValue(value: unknown): string {
  const truncate = (text: string) => (text.length > 140 ? `${text.slice(0, 137)}...` : text);
  if (value === undefined) return '(undefined)';
  if (value === null) return 'null';
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'number' || typeof value === 'boolean') return truncate(String(value));
  try {
    return truncate(JSON.stringify(value));
  } catch {
    return truncate(String(value));
  }
}

export type { DiffChange };
