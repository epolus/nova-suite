/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ChangeDetail } from '@/api/client';
import type { ChangeFormState } from './useChangeDetail';
import { EMPTY_CHANGE_FORM, formFromDetail } from './useChangeDetail';

function normalizeForm(form: ChangeFormState): ChangeFormState {
  return {
    ...form,
    affected_cis: [...form.affected_cis].sort(),
  };
}

export function hasChangeFormChanges(
  form: ChangeFormState,
  change: ChangeDetail | null,
  isNew: boolean,
): boolean {
  if (isNew) {
    const baseline = { ...EMPTY_CHANGE_FORM, change_type_id: form.change_type_id };
    return JSON.stringify(normalizeForm(form)) !== JSON.stringify(normalizeForm(baseline));
  }
  if (!change) return false;
  return JSON.stringify(normalizeForm(form)) !== JSON.stringify(normalizeForm(formFromDetail(change)));
}
