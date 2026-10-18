/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { shouldRetireMissingDevices } from './sync';

describe('Intune full sync retire-missing', () => {
  it('retires missing devices only on a non-empty full sync', () => {
    expect(shouldRetireMissingDevices(true, 3)).toBe(true);
    expect(shouldRetireMissingDevices(true, 0)).toBe(false);
    expect(shouldRetireMissingDevices(false, 3)).toBe(false);
    expect(shouldRetireMissingDevices(true, 3, 1)).toBe(false);
  });
});