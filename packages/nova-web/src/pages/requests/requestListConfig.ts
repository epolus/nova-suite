/* SPDX-License-Identifier: AGPL-3.0-only */
export const REQUEST_STATUS_OPTIONS = [
  '',
  'submitted',
  'pending_approval',
  'approved',
  'in_progress',
  'fulfilled',
  'rejected',
  'cancelled',
] as const;

export interface RequestBulkActionConfig {
  id: 'approve' | 'reject';
  label: string;
  variant?: 'default' | 'outline' | 'warning';
  requiresConfirm?: boolean;
}

export const REQUEST_BULK_ACTIONS: RequestBulkActionConfig[] = [
  {
    id: 'approve',
    label: 'Approve Selected',
    variant: 'default',
    requiresConfirm: true,
  },
  {
    id: 'reject',
    label: 'Reject Selected',
    variant: 'warning',
    requiresConfirm: true,
  },
];

