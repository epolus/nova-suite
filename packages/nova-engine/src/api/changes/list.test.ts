/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { buildChangeListFilters, getChangeNav, listChanges } from './list';

const USER = { id: 'user-1' };

const FULL_QUERY: Record<string, unknown> = {
  status: 'approved',
  stage: 'planning',
  risk_level: 'high',
  change_type_id: 'type-1',
  assignment_group_id: 'group-1',
  search: 'db',
  'cf.number': 'CHG00',
  'cf.assigned_to_name': 'Ann',
  'cf.bogus': 'ignored',
  sort_by: 'risk_level',
  sort_dir: 'desc',
};

describe('buildChangeListFilters', () => {
  it('is deterministic for identical inputs', () => {
    const opts = { hasChangeRole: true, includeAssignmentGroup: true };
    expect(buildChangeListFilters(FULL_QUERY, USER, opts)).toEqual(
      buildChangeListFilters(FULL_QUERY, USER, opts),
    );
  });

  it('scopes non-change-role users to their own changes', () => {
    const f = buildChangeListFilters({}, USER, { hasChangeRole: false, includeAssignmentGroup: true });
    expect(f.conditions).toContain('(c.requested_by = $1 OR c.assigned_to = $1)');
    expect(f.params).toEqual(['user-1']);
    const all = buildChangeListFilters({}, USER, { hasChangeRole: true, includeAssignmentGroup: true });
    expect(all.conditions).toEqual(['c.tenant_id = current_tenant_id()']);
    expect(all.params).toEqual([]);
  });

  it('only the list path filters on assignment_group_id', () => {
    const list = buildChangeListFilters(FULL_QUERY, USER, { hasChangeRole: true, includeAssignmentGroup: true });
    const nav = buildChangeListFilters(FULL_QUERY, USER, { hasChangeRole: true, includeAssignmentGroup: false });
    expect(list.params).toContain('group-1');
    expect(nav.params).not.toContain('group-1');
    expect(list.params.length).toBe(nav.params.length + 1);
    expect(nav.orderClause).toBe(list.orderClause);
  });

  it('applies whitelisted cf.* column filters as prefix ILIKE and ignores unknown', () => {
    const f = buildChangeListFilters(FULL_QUERY, USER, { hasChangeRole: true, includeAssignmentGroup: true });
    expect(f.conditions).toContain(`c.number ILIKE $${f.paramIdx - 2}`);
    expect(f.conditions).toContain(`u.display_name ILIKE $${f.paramIdx - 1}`);
    expect(f.params.slice(-2)).toEqual(['CHG00%', 'Ann%']);
    expect(f.conditions.join(' ')).not.toContain('bogus');
  });

  it('whitelists sort columns and defaults to updated_at DESC', () => {
    const opts = { hasChangeRole: true, includeAssignmentGroup: true };
    expect(buildChangeListFilters(FULL_QUERY, USER, opts).orderClause).toBe('ORDER BY c.risk_level DESC');
    expect(buildChangeListFilters({ sort_by: 'title' }, USER, opts).orderClause).toBe('ORDER BY c.title ASC');
    expect(buildChangeListFilters({ sort_by: 'DROP TABLE' }, USER, opts).orderClause).toBe(
      'ORDER BY c.updated_at DESC',
    );
  });
});

describe('listChanges / getChangeNav', () => {
  it('paginates with trailing LIMIT/OFFSET params', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: '45' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a' }] });
    const client = { query } as unknown as PoolClient;
    const res = await listChanges(client, { status: 'draft' }, USER, { hasChangeRole: true, page: 2, limit: 20 });
    expect(res.pagination).toEqual({ page: 2, limit: 20, total: 45, pages: 3 });
    expect(query.mock.calls[1][1]).toEqual(['draft', 20, 20]);
    expect(query.mock.calls[1][0]).toContain('LIMIT $2 OFFSET $3');
  });

  it('returns null neighbours without querying when current is missing', async () => {
    const query = vi.fn();
    const nav = await getChangeNav({ query } as unknown as PoolClient, {}, USER, { hasChangeRole: true });
    expect(nav).toEqual({ prev_id: null, next_id: null });
    expect(query).not.toHaveBeenCalled();
  });

  it('computes prev/next from the ordered id list', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
    const client = { query } as unknown as PoolClient;
    const mid = await getChangeNav(client, { current: 'b' }, USER, { hasChangeRole: true });
    expect(mid).toEqual({ prev_id: 'a', next_id: 'c' });
    const first = await getChangeNav(client, { current: 'a' }, USER, { hasChangeRole: true });
    expect(first).toEqual({ prev_id: null, next_id: 'b' });
    const missing = await getChangeNav(client, { current: 'zz' }, USER, { hasChangeRole: true });
    expect(missing).toEqual({ prev_id: null, next_id: null });
  });
});
