/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { normalizeChangePir } from './change-pir';

describe('normalizeChangePir', () => {
  it('requires an outcome and both downtime figures', () => {
    expect(() => normalizeChangePir({
      success: null,
      failureCategory: null,
      plannedDowntimeMinutes: 0,
      actualDowntimeMinutes: 0,
    })).toThrow(/success outcome/);
    expect(() => normalizeChangePir({
      success: true,
      failureCategory: null,
      plannedDowntimeMinutes: null,
      actualDowntimeMinutes: 10,
    })).toThrow(/downtime/);
  });

  it('clears the failure category when the change succeeded', () => {
    expect(normalizeChangePir({
      success: true,
      failureCategory: 'rolled_back',
      plannedDowntimeMinutes: 30,
      actualDowntimeMinutes: 20,
    })).toEqual({
      success: true,
      failureCategory: null,
      plannedDowntimeMinutes: 30,
      actualDowntimeMinutes: 20,
    });
  });

  it('requires a known failure category when the change failed', () => {
    expect(() => normalizeChangePir({
      success: false,
      failureCategory: null,
      plannedDowntimeMinutes: 15,
      actualDowntimeMinutes: 40,
    })).toThrow(/failure category/);
    expect(normalizeChangePir({
      success: false,
      failureCategory: 'caused_incident',
      plannedDowntimeMinutes: 15,
      actualDowntimeMinutes: 40,
    }).failureCategory).toBe('caused_incident');
  });
});
