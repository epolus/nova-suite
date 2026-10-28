/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ServiceNowFetch } from './client';

export type FakeServiceNowOptions = {
  /** Tables that answer with this HTTP status instead of rows (e.g. 403 for ACL tests). */
  statusByTable?: Record<string, number>;
  /** Fail the first N requests with 503 to exercise retries. */
  failFirst?: number;
  /** Expected `Authorization` / `x-sn-apikey` header; mismatches return 401. */
  expectAuthHeader?: { name: string; value: string };
};

export type FakeServiceNow = {
  fetch: ServiceNowFetch;
  requests: string[];
};

function matches(row: Record<string, unknown>, term: string): boolean {
  if (!term || term.startsWith('ORDERBY') || term.startsWith('OR')) return true;
  const notIn = /^([\w.]+)NOT IN(.*)$/.exec(term);
  if (notIn) return !notIn[2].split(',').includes(String(row[notIn[1]] ?? ''));
  const inList = /^([\w.]+)IN(.*)$/.exec(term);
  if (inList) return inList[2].split(',').includes(String(row[inList[1]] ?? ''));
  const like = /^([\w.]+)LIKE(.*)$/.exec(term);
  if (like) return String(row[like[1]] ?? '').includes(like[2]);
  const eq = /^([\w.]+)=(.*)$/.exec(term);
  if (eq) return String(row[eq[1]] ?? '') === eq[2];
  return true;
}

/**
 * In-memory Table API for tests: supports `IN`, `NOT IN`, `LIKE`, `=` terms joined by `^`,
 * offset paging, `sysparm_fields`, and `X-Total-Count`. Unknown tables return 400, like ServiceNow.
 */
export function createFakeServiceNow(
  tables: Record<string, Array<Record<string, unknown>>>,
  opts: FakeServiceNowOptions = {},
): FakeServiceNow {
  const requests: string[] = [];
  let failures = opts.failFirst ?? 0;
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

  const fetch: ServiceNowFetch = async (url, init) => {
    requests.push(url);
    if (failures > 0) {
      failures -= 1;
      return json(503, { error: { message: 'Service unavailable' } });
    }
    if (opts.expectAuthHeader) {
      const got = new Headers(init.headers).get(opts.expectAuthHeader.name);
      if (got !== opts.expectAuthHeader.value) return json(401, { error: { message: 'User Not Authenticated' } });
    }
    const u = new URL(url);
    const m = /^\/api\/now\/table\/([a-z0-9_]+)$/.exec(u.pathname);
    if (!m) return json(404, { error: { message: 'Invalid path' } });
    const table = m[1];
    const forced = opts.statusByTable?.[table];
    if (forced) return json(forced, { error: { message: `Forced ${forced}` } });
    const rows = tables[table];
    if (!rows) return json(400, { error: { message: 'Invalid table', detail: table } });
    const query = u.searchParams.get('sysparm_query') ?? '';
    const filtered = rows.filter((r) => query.split('^').every((term) => matches(r, term)));
    const offset = Number(u.searchParams.get('sysparm_offset') ?? 0);
    const limit = Number(u.searchParams.get('sysparm_limit') ?? 10_000);
    const fields = u.searchParams.get('sysparm_fields')?.split(',').filter(Boolean);
    const page = filtered.slice(offset, offset + limit).map((r) =>
      fields ? Object.fromEntries(fields.map((f) => [f, r[f] ?? ''])) : r);
    return json(200, { result: page }, { 'X-Total-Count': String(filtered.length) });
  };
  return { fetch, requests };
}
