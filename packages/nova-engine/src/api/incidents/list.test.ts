/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { buildIncidentListFilters, getIncidentNav, listIncidents } from './list';

const USER = { id: 'user-1' };

const FULL_QUERY: Record<string, unknown> = {
  status_not_in: 'closed, cancelled',
  assigned_to_me: 'true',
  my_groups: 'true',
  priority: '2',
  sla_breached: 'true',
  search: 'vpn',
  'cf.number': 'INC00',
  'cf.assigned_to_name': 'Ann',
  'cf.bogus': 'ignored',
  sort_by: 'priority',
  sort_dir: 'desc',
};

describe('buildIncidentListFilters', () => {
  it('is deterministic for identical inputs', () => {
    const a = buildIncidentListFilters(FULL_QUERY, USER, { isFulfiller: true, sort: 'list' });
    const b = buildIncidentListFilters(FULL_QUERY, USER, { isFulfiller: true, sort: 'list' });
    expect(a).toEqual(b);
  });

  it('produces identical conditions + params for the list and nav paths', () => {
    for (const isFulfiller of [true, false]) {
      const list = buildIncidentListFilters(FULL_QUERY, USER, { isFulfiller, sort: 'list' });
      const nav = buildIncidentListFilters(FULL_QUERY, USER, { isFulfiller, sort: 'nav' });
      expect(nav.conditions).toEqual(list.conditions);
      expect(nav.params).toEqual(list.params);
      expect(nav.paramIdx).toBe(list.paramIdx);
      expect(nav.whereClause).toBe(list.whereClause);
      expect(nav.cfMap).toBe(list.cfMap);
    }
  });

  it('adds no visibility condition for fulfillers', () => {
    const f = buildIncidentListFilters({}, USER, { isFulfiller: true, sort: 'list' });
    expect(f.conditions).toEqual([]);
    expect(f.params).toEqual([]);
    expect(f.paramIdx).toBe(0);
    expect(f.whereClause).toBe('');
  });

  it('restricts end users to their own / submitted incidents as $1', () => {
    const f = buildIncidentListFilters({}, USER, { isFulfiller: false, sort: 'list' });
    expect(f.conditions).toHaveLength(1);
    expect(f.conditions[0]).toContain('i.caller_id = $1');
    expect(f.conditions[0]).toContain('j.author_id = $1');
    expect(f.params).toEqual(['user-1']);
    expect(f.paramIdx).toBe(1);
    expect(f.whereClause.startsWith('WHERE ')).toBe(true);
  });

  it('numbers placeholders after the end-user visibility param', () => {
    const f = buildIncidentListFilters(
      { status: 'new', priority: '3' },
      USER,
      { isFulfiller: false, sort: 'list' },
    );
    expect(f.conditions.slice(1)).toEqual(['i.status = $2', 'i.priority = $3']);
    expect(f.params).toEqual(['user-1', 'new', 3]);
    expect(f.paramIdx).toBe(3);
  });

  it('expands status_not_in into one placeholder per status', () => {
    const f = buildIncidentListFilters(
      { status_not_in: ' closed , ,cancelled' },
      USER,
      { isFulfiller: true, sort: 'list' },
    );
    expect(f.conditions).toEqual(['i.status NOT IN ($1, $2)']);
    expect(f.params).toEqual(['closed', 'cancelled']);
  });

  it('todo filters exclude closed statuses unless an explicit status is set', () => {
    const todo = buildIncidentListFilters(
      { assigned_to_me: 'true' },
      USER,
      { isFulfiller: true, sort: 'list' },
    );
    expect(todo.conditions[0]).toBe(`i.status NOT IN ('resolved', 'closed', 'cancelled')`);
    expect(todo.conditions[1]).toBe('i.assigned_to = $1');
    expect(todo.params).toEqual(['user-1']);

    const explicit = buildIncidentListFilters(
      { assigned_to_me: 'true', status: 'resolved' },
      USER,
      { isFulfiller: true, sort: 'list' },
    );
    expect(explicit.conditions[0]).toBe('i.status = $1');
  });

  it('only applies known cf.* columns', () => {
    const f = buildIncidentListFilters(
      { 'cf.title': 'net', 'cf.bogus': 'x' },
      USER,
      { isFulfiller: true, sort: 'list' },
    );
    expect(f.conditions).toEqual(['i.title ILIKE $1']);
    expect(f.params).toEqual(['net%']);
  });

  it('builds list vs nav sort clauses', () => {
    const q = { sort_by: 'priority', sort_dir: 'desc' };
    expect(buildIncidentListFilters(q, USER, { isFulfiller: true, sort: 'list' }).sortClause)
      .toBe('ORDER BY i.priority DESC');
    expect(buildIncidentListFilters(q, USER, { isFulfiller: true, sort: 'nav' }).sortClause)
      .toBe('ORDER BY i.priority DESC NULLS LAST, i.id DESC');
    expect(buildIncidentListFilters({}, USER, { isFulfiller: true, sort: 'list' }).sortClause)
      .toBe('ORDER BY i.created_at DESC');
    expect(buildIncidentListFilters({}, USER, { isFulfiller: true, sort: 'nav' }).sortClause)
      .toBe('ORDER BY i.created_at DESC NULLS LAST, i.id DESC');
    expect(
      buildIncidentListFilters({ sort_by: 'nope' }, USER, { isFulfiller: true, sort: 'list' }).sortClause,
    ).toBe('ORDER BY i.created_at DESC');
  });
});

describe('listIncidents / getIncidentNav share the same filter params', () => {
  function mockClient() {
    // Snapshot params at call time (services reuse/mutate the same array).
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params: [...params] });
      if (sql.includes('count(*)')) return { rows: [{ count: '7' }] };
      if (sql.includes('prev_id')) return { rows: [{ prev_id: 'a', next_id: 'b' }] };
      return { rows: [] };
    });
    return { client: { query } as unknown as PoolClient, calls };
  }

  it('passes the same WHERE params (list adds limit/offset, nav adds current id)', async () => {
    const listMock = mockClient();
    const navMock = mockClient();
    const query = { status: 'new', search: 'x' };

    const listed = await listIncidents(listMock.client, query, USER, { isFulfiller: false, page: 2, limit: 10 });
    const nav = await getIncidentNav(navMock.client, query, USER, { isFulfiller: false, currentId: 'cur' });

    const listParams = listMock.calls[0].params;
    const navParams = navMock.calls[0].params;
    expect(navParams.slice(0, -1)).toEqual(listParams);

    const listSelectParams = listMock.calls[1].params;
    expect(listSelectParams.slice(-2)).toEqual([10, 10]);
    expect(navParams[navParams.length - 1]).toBe('cur');

    expect(listed.pagination).toEqual({ page: 2, limit: 10, total: 7, pages: 1 });
    expect(nav.prev_id).toBe('a');
    expect(nav.next_id).toBe('b');
    expect(nav.filterCount).toBe(3);
  });
});
