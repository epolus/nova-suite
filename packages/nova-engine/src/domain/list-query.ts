/* SPDX-License-Identifier: AGPL-3.0-only */
// Small shared helpers for paginated list endpoints (cf.* filters, pagination meta).

/**
 * Append whitelisted `cf.<key>` query params as `column ILIKE $n` prefix matches.
 * `nextParamIdx` is the next 1-based `$n` index to use; returns the next free index.
 */
export function appendPrefixColumnFilters(
  query: Record<string, unknown>,
  cfMap: Record<string, string>,
  conditions: string[],
  params: unknown[],
  nextParamIdx: number,
): number {
  let idx = nextParamIdx;
  for (const [qKey, qVal] of Object.entries(query)) {
    if (typeof qKey === 'string' && qKey.startsWith('cf.') && typeof qVal === 'string' && qVal) {
      const col = cfMap[qKey.slice(3)];
      if (col) {
        conditions.push(`${col} ILIKE $${idx}`);
        params.push(`${qVal}%`);
        idx++;
      }
    }
  }
  return idx;
}

export function paginationMeta(page: number, limit: number, total: number): {
  page: number;
  limit: number;
  total: number;
  pages: number;
} {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}

export function sqlSortDirection(sortDir: unknown): 'ASC' | 'DESC' {
  return sortDir === 'desc' ? 'DESC' : 'ASC';
}
