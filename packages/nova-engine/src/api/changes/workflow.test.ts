/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { computeAllowedChangeActions, normalizeStatusAndStage } from './workflow';
import { suggestRiskLevelFromScore } from './risk';
import { validateScheduleRange } from './mutations';

const SCHEDULED = { scheduled_start: '2026-01-01T00:00:00Z', scheduled_end: '2026-01-02T00:00:00Z' };

describe('normalizeStatusAndStage', () => {
  it('maps transition actions to stage/status', () => {
    expect(normalizeStatusAndStage('request_approval')).toEqual({ stage: 'approval', status: 'pending_approval' });
    expect(normalizeStatusAndStage('close')).toEqual({ stage: 'review', status: 'closed' });
    expect(normalizeStatusAndStage('cancel')).toEqual({ stage: 'request', status: 'cancelled' });
    expect(normalizeStatusAndStage('nope')).toEqual({ stage: 'request', status: 'draft' });
  });
});

describe('computeAllowedChangeActions', () => {
  it('draft can submit assessment and cancel', () => {
    expect(computeAllowedChangeActions({ status: 'draft' }, 0, false)).toEqual(['submit_assessment', 'cancel']);
  });

  it('assessment needs plan, schedule and service/CI context to request approval', () => {
    const base = { status: 'assessment', implementation_plan: 'plan', ...SCHEDULED };
    expect(computeAllowedChangeActions(base, 0, false)).toEqual(['cancel']);
    expect(computeAllowedChangeActions(base, 0, true)).toEqual(['request_approval', 'cancel']);
    expect(computeAllowedChangeActions({ ...base, service_id: 's1' }, 0, false)).toContain('request_approval');
  });

  it('pending_approval offers approve only when no approvals pending and scheduled', () => {
    const c = { status: 'pending_approval', ...SCHEDULED };
    expect(computeAllowedChangeActions(c, 1, true)).toEqual(['reject', 'cancel']);
    expect(computeAllowedChangeActions(c, 0, true)).toEqual(['reject', 'approve', 'cancel']);
    expect(computeAllowedChangeActions({ status: 'pending_approval' }, 0, true)).toEqual(['reject', 'cancel']);
  });

  it('terminal statuses allow nothing', () => {
    expect(computeAllowedChangeActions({ status: 'closed' }, 0, false)).toEqual([]);
    expect(computeAllowedChangeActions({ status: 'cancelled' }, 0, false)).toEqual([]);
  });
});

describe('suggestRiskLevelFromScore', () => {
  it('uses 8/16/24 thresholds', () => {
    expect(suggestRiskLevelFromScore(7)).toBe('low');
    expect(suggestRiskLevelFromScore(8)).toBe('medium');
    expect(suggestRiskLevelFromScore(16)).toBe('high');
    expect(suggestRiskLevelFromScore(24)).toBe('very_high');
  });
});

describe('validateScheduleRange', () => {
  it('rejects end before start with a 400', () => {
    expect(() => validateScheduleRange('2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z')).toThrow(
      /scheduled_end must be greater/,
    );
  });
  it('ignores missing or unparsable values and equal bounds', () => {
    expect(() => validateScheduleRange(null, '2026-01-01T00:00:00Z')).not.toThrow();
    expect(() => validateScheduleRange('garbage', '2026-01-01T00:00:00Z')).not.toThrow();
    expect(() => validateScheduleRange('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')).not.toThrow();
  });
});
