/* SPDX-License-Identifier: AGPL-3.0-only */
export const CHANGE_STATUS_OPTIONS = [
  'all',
  'draft',
  'assessment',
  'pending_approval',
  'approved',
  'rejected',
  'planning',
  'scheduled',
  'implementing',
  'implemented',
  'reviewing',
  'closed',
  'cancelled',
] as const;

export const CHANGE_RISK_OPTIONS = ['all', 'low', 'medium', 'high', 'very_high'] as const;

export type ChangeBulkActionId = 'close';

export interface ChangeBulkActionConfig {
  id: ChangeBulkActionId;
  label: string;
  variant?: 'default' | 'outline' | 'warning';
  requiresConfirm?: boolean;
}

export const CHANGE_BULK_ACTIONS: ChangeBulkActionConfig[] = [
  {
    id: 'close',
    label: 'Close Changes',
    variant: 'outline',
    requiresConfirm: true,
  },
];

