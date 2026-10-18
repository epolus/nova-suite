/* SPDX-License-Identifier: AGPL-3.0-only */

export const CHANGE_FAILURE_CATEGORIES = [
  'incomplete',
  'caused_incident',
  'rolled_back',
  'exceeded_window',
  'other',
] as const;

export type ChangeFailureCategory = (typeof CHANGE_FAILURE_CATEGORIES)[number];

export type ChangePirInput = {
  success: boolean | null;
  failureCategory: string | null;
  plannedDowntimeMinutes: number | null;
  actualDowntimeMinutes: number | null;
};

function isNonNegativeInt(value: number | null): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Fields required before a change can close. */
export function normalizeChangePir(input: ChangePirInput): {
  success: boolean;
  failureCategory: ChangeFailureCategory | null;
  plannedDowntimeMinutes: number;
  actualDowntimeMinutes: number;
} {
  if (input.success !== true && input.success !== false) {
    throw new Error('Post-implementation review requires a success outcome before close');
  }
  if (!isNonNegativeInt(input.plannedDowntimeMinutes) || !isNonNegativeInt(input.actualDowntimeMinutes)) {
    throw new Error('Planned and actual downtime minutes are required before close');
  }
  if (input.success) {
    return {
      success: true,
      failureCategory: null,
      plannedDowntimeMinutes: input.plannedDowntimeMinutes,
      actualDowntimeMinutes: input.actualDowntimeMinutes,
    };
  }
  if (!input.failureCategory || !CHANGE_FAILURE_CATEGORIES.includes(input.failureCategory as ChangeFailureCategory)) {
    throw new Error('A failure category is required when the change was not successful');
  }
  return {
    success: false,
    failureCategory: input.failureCategory as ChangeFailureCategory,
    plannedDowntimeMinutes: input.plannedDowntimeMinutes,
    actualDowntimeMinutes: input.actualDowntimeMinutes,
  };
}
