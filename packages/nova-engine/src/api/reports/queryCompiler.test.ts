/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { AppError } from '../../middleware/errorHandler';
import { compileChartQuery, compileKpiQuery, compileTableQuery } from './queryCompiler';

describe('report query compiler', () => {
  it('compiles a table query with allowlisted columns and filters', () => {
    const query = compileTableQuery({
      type: 'table',
      dataset: 'incidents',
      columns: ['number', 'status', 'created_at'],
      filters: [
        { field: 'status', operator: 'eq', value: 'new' },
        { field: 'title', operator: 'contains', value: 'vpn' },
      ],
      sort: { field: 'created_at', direction: 'desc' },
      limit: 20,
    });

    expect(query.text).toContain('FROM incidents t');
    expect(query.text).toContain('ORDER BY t.created_at DESC');
    expect(query.values).toEqual(['new', 'vpn', 20]);
  });

  it('rejects non-allowlisted table columns', () => {
    expect(() => compileTableQuery({
      type: 'table',
      dataset: 'incidents',
      columns: ['number', 'password_hash'],
      limit: 10,
    })).toThrow(AppError);
  });

  it('rejects non-allowlisted sort fields', () => {
    expect(() => compileTableQuery({
      type: 'table',
      dataset: 'changes',
      columns: ['number', 'status'],
      sort: { field: 'payload', direction: 'asc' },
      limit: 10,
    })).toThrow(AppError);
  });

  it('compiles count KPI without metric field', () => {
    const query = compileKpiQuery({
      type: 'kpi',
      dataset: 'requests',
      metric: 'count',
      filters: [{ field: 'status', operator: 'eq', value: 'submitted' }],
    });
    expect(query.text).toContain('count(*)::numeric AS value');
    expect(query.values).toEqual(['submitted']);
  });

  it('rejects avg KPI on non-numeric fields', () => {
    expect(() => compileKpiQuery({
      type: 'kpi',
      dataset: 'incidents',
      metric: 'avg',
      metric_field: 'status',
    })).toThrow(AppError);
  });

  it('compiles bar chart query with group by allowlist', () => {
    const query = compileChartQuery({
      type: 'bar_chart',
      dataset: 'incidents',
      group_by: 'status',
      metric: 'count',
      top_n: 5,
    });
    expect(query.text).toContain('GROUP BY t.status');
    expect(query.values).toEqual([5]);
  });

  it('rejects chart group_by on non-allowlisted fields', () => {
    expect(() => compileChartQuery({
      type: 'pie_chart',
      dataset: 'incidents',
      group_by: 'resolved_at',
      metric: 'count',
    })).toThrow(AppError);
  });
});

