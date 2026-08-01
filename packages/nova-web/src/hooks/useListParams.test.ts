/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { buildListSearchParams, parseListSearchParams } from './useListParams';

describe('useListParams helpers', () => {
  it('round-trips search, sort, page, and filters through URL params', () => {
    const params = new URLSearchParams();
    params.set('search', 'printer');
    params.set('sort', 'created_at');
    params.set('dir', 'desc');
    params.set('page', '2');
    params.set('status', 'open');
    params.set('cf.priority', '1');

    const parsed = parseListSearchParams(params, {
      defaultCols: ['number', 'title'],
      filterKeys: ['status'],
    });

    expect(parsed.search).toBe('printer');
    expect(parsed.sort).toBe('created_at');
    expect(parsed.dir).toBe('desc');
    expect(parsed.page).toBe(2);
    expect(parsed.filters.status).toBe('open');
    expect(parsed.columnFilters.priority).toBe('1');

    const rebuilt = buildListSearchParams(parsed, { filterKeys: ['status'] });
    expect(rebuilt.get('search')).toBe('printer');
    expect(rebuilt.get('status')).toBe('open');
    expect(rebuilt.get('cf.priority')).toBe('1');
  });
});
