/* SPDX-License-Identifier: AGPL-3.0-only */
export const INCIDENT_STATUS_OPTIONS = [
  'active',
  'all',
  'new',
  'assigned',
  'in_progress',
  'pending',
  'resolved',
  'closed',
] as const;

export type IncidentBulkActionId = 'assign_group' | 'close';

export interface IncidentBulkActionConfig {
  id: IncidentBulkActionId;
  label: string;
  variant?: 'default' | 'outline' | 'warning';
  requiresGroup?: boolean;
  requiresConfirm?: boolean;
}

export const INCIDENT_BULK_ACTIONS: IncidentBulkActionConfig[] = [
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

