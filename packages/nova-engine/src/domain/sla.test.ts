/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import {
  addBusinessHours,
  pauseSlaClock,
  resumeSlaClock,
  shouldPauseSlaForPending,
  type BusinessCalendarData,
} from './sla';

const weekdayCalendar: BusinessCalendarData = {
  timezone: 'UTC',
  hours: [
    { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
    { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' },
    { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' },
    { dayOfWeek: 4, startTime: '09:00', endTime: '17:00' },
    { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' },
  ],
  holidays: [],
};

describe('addBusinessHours', () => {
  it('falls back to wall-clock when no calendar is provided', () => {
    const from = new Date('2026-03-10T10:00:00.000Z');
    const result = addBusinessHours(from, 2, null);
    expect(result.toISOString()).toBe('2026-03-10T12:00:00.000Z');
  });

  it('adds hours within the same business day', () => {
    // Tuesday 10:00 UTC → +2h business → 12:00
    const from = new Date('2026-03-10T10:00:00.000Z');
    const result = addBusinessHours(from, 2, weekdayCalendar);
    expect(result.toISOString()).toBe('2026-03-10T12:00:00.000Z');
  });

  it('skips overnight and weekends when crossing day boundary', () => {
    // Friday 16:00 → +2h business → Monday 10:00 (1h Fri + 1h Mon)
    const from = new Date('2026-03-13T16:00:00.000Z');
    const result = addBusinessHours(from, 2, weekdayCalendar);
    expect(result.toISOString()).toBe('2026-03-16T10:00:00.000Z');
  });

  it('skips configured holidays', () => {
    const calendar: BusinessCalendarData = {
      ...weekdayCalendar,
      holidays: ['2026-03-11'], // Wednesday
    };
    // Tuesday 16:00 → +2h → skip Wed holiday → Thursday 10:00
    const from = new Date('2026-03-10T16:00:00.000Z');
    const result = addBusinessHours(from, 2, calendar);
    expect(result.toISOString()).toBe('2026-03-12T10:00:00.000Z');
  });

  it('jumps forward when starting outside business hours', () => {
    // Tuesday 07:00 → +1h → Tuesday 10:00
    const from = new Date('2026-03-10T07:00:00.000Z');
    const result = addBusinessHours(from, 1, weekdayCalendar);
    expect(result.toISOString()).toBe('2026-03-10T10:00:00.000Z');
  });
});

describe('pauseSlaClock / resumeSlaClock', () => {
  it('sets sla_paused_at without changing due dates', () => {
    const now = new Date('2026-03-10T12:00:00.000Z');
    const paused = pauseSlaClock({
      sla_paused_at: null,
      sla_paused_ms: 0,
      response_due_at: '2026-03-10T13:00:00.000Z',
      sla_due_at: '2026-03-10T18:00:00.000Z',
    }, now);
    expect(paused.sla_paused_at).toBe(now.toISOString());
    expect(paused.response_due_at).toBe('2026-03-10T13:00:00.000Z');
    expect(paused.sla_due_at).toBe('2026-03-10T18:00:00.000Z');
  });

  it('extends due dates by paused duration on resume', () => {
    const resumed = resumeSlaClock({
      sla_paused_at: '2026-03-10T12:00:00.000Z',
      sla_paused_ms: 1000,
      response_due_at: '2026-03-10T13:00:00.000Z',
      sla_due_at: '2026-03-10T18:00:00.000Z',
    }, new Date('2026-03-10T14:00:00.000Z'));
    expect(resumed.sla_paused_at).toBeNull();
    expect(resumed.sla_paused_ms).toBe(1000 + 2 * 60 * 60 * 1000);
    expect(resumed.response_due_at).toBe('2026-03-10T15:00:00.000Z');
    expect(resumed.sla_due_at).toBe('2026-03-10T20:00:00.000Z');
  });
});

describe('shouldPauseSlaForPending', () => {
  it('pauses for waiting_* reasons only', () => {
    expect(shouldPauseSlaForPending('waiting_for_caller')).toBe(true);
    expect(shouldPauseSlaForPending('other')).toBe(false);
    expect(shouldPauseSlaForPending(null)).toBe(false);
  });
});
