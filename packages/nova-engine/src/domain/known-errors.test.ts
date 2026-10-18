/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { canRetireKnownError, hasKnownErrorContent } from './known-errors';

describe('known error control', () => {
  it('requires symptoms and a workaround', () => {
    expect(hasKnownErrorContent('slow login', 'reset the session')).toBe(true);
    expect(hasKnownErrorContent('  ', 'workaround')).toBe(false);
    expect(hasKnownErrorContent('symptoms', '')).toBe(false);
  });

  it('allows retirement with a permanent fix or a linked change', () => {
    expect(canRetireKnownError('', 0)).toBe(false);
    expect(canRetireKnownError('patch the driver', 0)).toBe(true);
    expect(canRetireKnownError(null, 1)).toBe(true);
  });
});