/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Change service shared types ───

/** Authenticated caller as seen by change services (no Express types). */
export interface ChangeActor {
  id: string;
  tenant_id: string;
  /** admin role */
  isAdmin: boolean;
  /** admin / fulfiller / change_manager */
  hasChangeRole: boolean;
  /** admin / change_manager – may override blocking conflicts on emergency changes */
  canOverrideBlockingConflicts: boolean;
}

/** Subset of the authenticated user needed for list scoping. */
export interface ChangeListUser {
  id: string;
}

export type ChangeTransitionAction =
  | 'submit_assessment'
  | 'request_approval'
  | 'approve'
  | 'reject'
  | 'start_planning'
  | 'schedule'
  | 'start_implementation'
  | 'mark_implemented'
  | 'start_review'
  | 'close'
  | 'cancel';
