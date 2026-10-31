/* SPDX-License-Identifier: AGPL-3.0-only */

export function formatCustomAttribute(value: unknown, pretty = false): string {
  if (typeof value === 'string') return value;
  if (value != null && typeof value === 'object') return JSON.stringify(value, null, pretty ? 2 : undefined);
  return value == null ? '' : String(value);
}

/** Keep objects and arrays as JSON; everything else stays text the editor stored. */
export function parseCustomAttribute(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === 'object') return parsed;
  } catch {
    // The user typed text that only looks like JSON.
  }
  return value;
}
