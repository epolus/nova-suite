/* SPDX-License-Identifier: AGPL-3.0-only */

export function canStartInvestigation(status: string): boolean {
  return status === 'declared';
}

export type FollowUpKind = 'problem' | 'change';

export function existingFollowUpId(
  item: { problem_id?: string | null; change_id?: string | null },
  kind: FollowUpKind,
): string | null {
  const id = kind === 'problem' ? item.problem_id : item.change_id;
  const text = String(id ?? '').trim();
  return text.length > 0 ? text : null;
}
