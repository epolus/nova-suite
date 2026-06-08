/* SPDX-License-Identifier: AGPL-3.0-only */

/** `in_progress` → `inProgress` for message key lookup. */
export function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

export function formatEnumFallback(value: string): string {
  return value.replace(/_/g, ' ');
}
