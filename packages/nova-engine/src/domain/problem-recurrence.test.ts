/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { DEFAULT_RECURRENCE_THRESHOLD, DEFAULT_TITLE_SIMILARITY } from '@nova-suite/shared';
import { usesStoredRecurrenceScan } from './problem-recurrence';

describe('recurrence scan selection', () => {
  it('reads stored candidates after a scan at the default threshold', () => {
    expect(usesStoredRecurrenceScan(true, DEFAULT_RECURRENCE_THRESHOLD, DEFAULT_TITLE_SIMILARITY)).toBe(true);
  });

  it('keeps the live query before the first scan or when the caller changes the threshold', () => {
    expect(usesStoredRecurrenceScan(false, DEFAULT_RECURRENCE_THRESHOLD, DEFAULT_TITLE_SIMILARITY)).toBe(false);
    expect(usesStoredRecurrenceScan(true, 5, DEFAULT_TITLE_SIMILARITY)).toBe(false);
    expect(usesStoredRecurrenceScan(true, DEFAULT_RECURRENCE_THRESHOLD, 0.8)).toBe(false);
  });
});
