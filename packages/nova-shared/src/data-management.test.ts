/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import {
  DataManagementQueryError,
  compileIncidentMatch,
  incidentCountSql,
  incidentIdPageSql,
  listDataManagementTargets,
} from './data-management';

describe('compileIncidentMatch', () => {
  it('keeps closed and cancelled incidents and parameterizes older_than', () => {
    const match = compileIncidentMatch([
      { field: 'created_at', operator: 'older_than', value: { amount: 2, unit: 'years' } },
    ]);
    expect(match.where).toBe(
      "t.status::text IN ('closed', 'cancelled') AND t.created_at < NOW() - ($1 * INTERVAL '1 year')",
    );
    expect(match.values).toEqual([2]);
    expect(match.where).not.toContain('2');
  });

  it('omits the status guard when open records are included and limits archive to active rows', () => {
    const match = compileIncidentMatch(
      [{ field: 'closed_at', operator: 'older_than', value: { amount: 18, unit: 'months' } }],
      { includeOpen: true, onlyActive: true },
    );
    expect(match.where).toBe(
      "t.is_active = true AND t.closed_at < NOW() - ($1 * INTERVAL '1 month')",
    );
    expect(match.values).toEqual([18]);
  });

  it('rejects an empty filter list', () => {
    expect(() => compileIncidentMatch([])).toThrow(DataManagementQueryError);
  });

  it('rejects fields and operators outside the catalog', () => {
    expect(() => compileIncidentMatch([
      { field: 'created_at; drop table incidents', operator: 'older_than', value: { amount: 1, unit: 'days' } },
    ])).toThrow(/Unsupported filter field/);
    expect(() => compileIncidentMatch([
      { field: 'title', operator: 'older_than', value: { amount: 1, unit: 'days' } },
    ])).toThrow(/not allowed/);
  });

  it('binds list and contains values', () => {
    const match = compileIncidentMatch([
      { field: 'status', operator: 'in', value: ['closed', 'cancelled'] },
      { field: 'title', operator: 'contains', value: 'vpn' },
    ], { includeOpen: true });
    expect(match.where).toContain('t.status::text = ANY($1::text[])');
    expect(match.where).toContain("t.title ILIKE '%' || $2 || '%'");
    expect(match.values).toEqual([['closed', 'cancelled'], 'vpn']);
    expect(incidentCountSql(match).text.startsWith('SELECT count(*)::int AS count FROM incidents t WHERE')).toBe(true);
  });

  it('pages by id with the next two parameters', () => {
    const match = compileIncidentMatch([
      { field: 'priority', operator: 'gte', value: 3 },
    ]);
    expect(incidentIdPageSql(match)).toContain('t.id > $2::uuid');
    expect(incidentIdPageSql(match)).toContain('LIMIT $3');
  });

  it('publishes incidents without SQL fragments', () => {
    const [target] = listDataManagementTargets();
    expect(target.key).toBe('incidents');
    expect(target.actions).toEqual(['delete', 'archive']);
    const created = target.fields.find((field) => field.key === 'created_at');
    expect(created?.operators).toContain('older_than');
    expect(JSON.stringify(target)).not.toContain('t.created_at');
  });
});
