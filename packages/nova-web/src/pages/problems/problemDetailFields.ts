/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Problem } from '@/api/client';
import type { ProblemFormState } from './useProblemDetail';
import { EMPTY_PROBLEM_FORM, formFromDetail } from './useProblemDetail';

export function hasProblemFormChanges(
  form: ProblemFormState,
  problem: Problem | null,
  isNew: boolean,
): boolean {
  if (isNew) {
    return JSON.stringify(form) !== JSON.stringify(EMPTY_PROBLEM_FORM);
  }
  if (!problem) return false;
  return JSON.stringify(form) !== JSON.stringify(formFromDetail(problem));
}
