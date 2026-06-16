/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { AppError } from '../middleware/errorHandler';
import { fillDailyGaps } from './fillDailyGaps';
import { compileTrendQuery } from './compileTrendQuery';

describe('compileTrendQuery', () => {
  it('compiles count_by_date trend for incidents.opened', () => {
    const query = compileTrendQuery({ dataset: 'incidents', metric: 'opened', days: 30 });
    expect(query.text).toContain('FROM incidents t');
    expect(query.text).toContain('t.created_at');
    expect(query.values).toEqual(['30']);
  });

  it('rejects unknown metrics', () => {
    expect(() => compileTrendQuery({ dataset: 'incidents', metric: 'unknown' }))
      .toThrow(AppError);
  });

  it('clamps days between 7 and 90', () => {
    const query = compileTrendQuery({ dataset: 'requests', metric: 'opened', days: 3 });
    expect(query.values).toEqual(['7']);
  });

  it('compiles snapshot trend for incidents.open_backlog', () => {
    const query = compileTrendQuery({ dataset: 'incidents', metric: 'open_backlog', days: 30 });
    expect(query.text).toContain('FROM metric_snapshots');
    expect(query.values).toEqual(['incidents', 'open_backlog', '30']);
    expect(query.metricDef.kind).toBe('snapshot');
  });
});

describe('fillDailyGaps', () => {
  it('fills missing days with zero', () => {
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    const yesterday = new Date(end);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const filled = fillDailyGaps([
      { date: yesterday.toISOString().slice(0, 10), value: 4 },
    ], 3);

    expect(filled).toHaveLength(3);
    expect(filled.filter((point) => point.value === 0)).toHaveLength(2);
    expect(filled.some((point) => point.value === 4)).toBe(true);
  });
});
