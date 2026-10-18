/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { warningAtMs } from './sla-warning';

describe('warningAtMs', () => {
  it('warns at 80% of a one-hour window', () => {
    const startedAt = Date.parse('2026-03-10T10:00:00.000Z');
    const dueMs = Date.parse('2026-03-10T11:00:00.000Z');
    expect(warningAtMs(dueMs, dueMs - startedAt, startedAt, 80)).toBe(
      Date.parse('2026-03-10T10:48:00.000Z'),
    );
  });

  it('moves the warning later when warning_pct is 90', () => {
    const startedAt = Date.parse('2026-03-10T10:00:00.000Z');
    const dueMs = Date.parse('2026-03-10T11:00:00.000Z');
    expect(warningAtMs(dueMs, dueMs - startedAt, startedAt, 90)).toBe(
      Date.parse('2026-03-10T10:54:00.000Z'),
    );
  });
});
