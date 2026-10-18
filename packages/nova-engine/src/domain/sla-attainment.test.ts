/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import {
  attainmentRate,
  classifySlaClock,
  pauseAdjustedElapsedMs,
  type SlaClockSample,
} from './sla-attainment';

const NOW = '2026-03-10T12:00:00.000Z';

function sample(overrides: Partial<SlaClockSample> = {}): SlaClockSample {
  return {
    status: 'in_progress',
    dueAt: '2026-03-10T18:00:00.000Z',
    completedAt: null,
    breached: false,
    pausedAt: null,
    terminalWhenUnresolved: false,
    ...overrides,
  };
}

describe('SLA attainment', () => {
  it('counts an on-time completion as met and a late one as breached', () => {
    expect(classifySlaClock(sample({ completedAt: '2026-03-10T16:00:00.000Z' }), NOW)).toBe('met');
    expect(classifySlaClock(sample({ completedAt: '2026-03-10T19:00:00.000Z' }), NOW)).toBe('breached');
  });

  it('keeps a paused clock open after the stored due date', () => {
    expect(classifySlaClock(sample({
      dueAt: '2026-03-10T11:00:00.000Z',
      pausedAt: '2026-03-10T10:00:00.000Z',
    }), NOW)).toBe('open');
  });

  it('treats a completion during that pause as met when the pause started before the due date', () => {
    expect(classifySlaClock(sample({
      dueAt: '2026-03-10T11:00:00.000Z',
      pausedAt: '2026-03-10T10:00:00.000Z',
      completedAt: '2026-03-10T12:30:00.000Z',
    }), NOW)).toBe('met');
  });

  it('breaches an open clock that is past due and not paused', () => {
    expect(classifySlaClock(sample({ dueAt: '2026-03-10T11:00:00.000Z' }), NOW)).toBe('breached');
  });

  it('breaches a resolved incident that never answered the clock', () => {
    expect(classifySlaClock(sample({
      status: 'resolved',
      terminalWhenUnresolved: true,
    }), NOW)).toBe('breached');
  });

  it('ignores cancelled incidents and incidents with no target', () => {
    expect(classifySlaClock(sample({ status: 'cancelled', completedAt: '2026-03-10T19:00:00.000Z' }), NOW)).toBe('none');
    expect(classifySlaClock(sample({ dueAt: null }), NOW)).toBe('none');
  });

  it('computes attainment only from decided clocks', () => {
    expect(attainmentRate(3, 1)).toBe(0.75);
    expect(attainmentRate(0, 0)).toBeNull();
  });

  it('removes completed and in-progress pause time from elapsed duration', () => {
    const elapsed = pauseAdjustedElapsedMs({
      startedAt: '2026-03-10T08:00:00.000Z',
      endedAt: '2026-03-10T12:00:00.000Z',
      pausedMs: 60 * 60 * 1000,
      pausedAt: '2026-03-10T11:00:00.000Z',
    });
    expect(elapsed).toBe(2 * 60 * 60 * 1000);
  });
});