/* SPDX-License-Identifier: AGPL-3.0-only */
export const TODO_INCIDENT_STATUS_OPTIONS = ['', 'new', 'assigned', 'in_progress', 'pending'] as const;

export type TodoBulkActionId = 'assign_group' | 'close';

export interface TodoBulkActionConfig {
  id: TodoBulkActionId;
  label: string;
  variant?: 'default' | 'outline' | 'warning';
  requiresGroup?: boolean;
  requiresConfirm?: boolean;
}

export const TODO_BULK_ACTIONS: TodoBulkActionConfig[] = [
  {
    id: 'assign_group',
    label: 'Assign Group',
    variant: 'default',
    requiresGroup: true,
  },
  {
    id: 'close',
    label: 'Close Incidents',
    variant: 'outline',
    requiresConfirm: true,
  },
];

