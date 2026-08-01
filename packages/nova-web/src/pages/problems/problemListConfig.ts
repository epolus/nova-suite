/* SPDX-License-Identifier: AGPL-3.0-only */
export const PROBLEM_STATUS_OPTIONS = [
  'all',
  'new',
  'investigating',
  'root_cause_identified',
  'fix_in_progress',
  'resolved',
  'closed',
  'known_error',
] as const;

export const PROBLEM_PRIORITY_OPTIONS = ['all', 'low', 'medium', 'high', 'critical'] as const;

export type ProblemBulkActionId = 'close';

export interface ProblemBulkActionConfig {
  id: ProblemBulkActionId;
  label: string;
  variant?: 'default' | 'outline' | 'warning';
  requiresConfirm?: boolean;
}

export const PROBLEM_BULK_ACTIONS: ProblemBulkActionConfig[] = [
  {
    id: 'close',
    label: 'Close Problems',
    variant: 'outline',
    requiresConfirm: true,
  },
];

