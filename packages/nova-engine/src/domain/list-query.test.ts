/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { appendPrefixColumnFilters, paginationMeta, sqlSortDirection } from './list-query';

const CF_MAP = {
  number: 'c.number',
  assigned_to_name: 'u.display_name',
};

describe('appendPrefixColumnFilters', () => {
  it('appends whitelisted cf.* filters as prefix ILIKE and advances the param index', () => {
    const conditions: string[] = ['c.tenant_id = current_tenant_id()'];
    const params: unknown[] = [];
    const next = appendPrefixColumnFilters(
      { 'cf.number': 'CHG', 'cf.assigned_to_name': 'Ann', 'cf.bogus': 'x', status: 'open' },
      CF_MAP,
      conditions,
      params,
      1,
    );
    expect(conditions).toEqual([
      'c.tenant_id = current_tenant_id()',
      'c.number ILIKE $1',
      'u.display_name ILIKE $2',
    ]);
    expect(params).toEqual(['CHG%', 'Ann%']);
    expect(next).toBe(3);
  });

  it('ignores empty values and non-string keys', () => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    const next = appendPrefixColumnFilters(
      { 'cf.number': '', 'cf.assigned_to_name': 12 as unknown as string },
      CF_MAP,
      conditions,
      params,
      4,
    );
    expect(conditions).toEqual([]);
    expect(params).toEqual([]);
    expect(next).toBe(4);
  });
});

describe('paginationMeta', () => {
  it('computes page count', () => {
    expect(paginationMeta(2, 20, 45)).toEqual({ page: 2, limit: 20, total: 45, pages: 3 });
    expect(paginationMeta(1, 10, 0)).toEqual({ page: 1, limit: 10, total: 0, pages: 0 });
  });
});

describe('sqlSortDirection', () => {
  it('only treats exact desc as DESC', () => {
    expect(sqlSortDirection('desc')).toBe('DESC');
    expect(sqlSortDirection('DESC')).toBe('ASC');
    expect(sqlSortDirection(undefined)).toBe('ASC');
  });
});
