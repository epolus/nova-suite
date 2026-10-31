/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { standardChangeSuccessRate } from './standard-change-outcome';

describe('standardChangeSuccessRate', () => {
  it('is empty until a change with a recorded outcome is closed', () => {
    expect(standardChangeSuccessRate(0, 0)).toBeNull();
    expect(standardChangeSuccessRate(1, 0)).toBeNull();
  });

  it('rounds the share of successful closes to two decimals', () => {
    expect(standardChangeSuccessRate(1, 1)).toBe(100);
    expect(standardChangeSuccessRate(0, 1)).toBe(0);
    expect(standardChangeSuccessRate(2, 3)).toBe(66.67);
    expect(standardChangeSuccessRate(1, 3)).toBe(33.33);
  });
});
