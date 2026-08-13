/* SPDX-License-Identifier: AGPL-3.0-only */
/**
 * Build a parameterized SET clause from a hardcoded column allowlist.
 * SQL identifiers never come from request keys.
 */
export function parameterizedSet(
  columns: readonly string[],
  updates: Record<string, unknown>,
): { sets: string[]; values: unknown[] } | null {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const col of columns) {
    if (!Object.prototype.hasOwnProperty.call(updates, col)) continue;
    if (updates[col] === undefined) continue;
    sets.push(`${col} = $${sets.length + 1}`);
    values.push(updates[col]);
  }
  if (sets.length === 0) return null;
  return { sets, values };
}
