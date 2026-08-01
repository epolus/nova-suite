/* SPDX-License-Identifier: AGPL-3.0-only */
export interface CmdbBulkActionConfig {
  id: 'open_selected';
  label: string;
  variant?: 'default' | 'outline' | 'warning';
}

export const CMDB_BULK_ACTIONS: CmdbBulkActionConfig[] = [
  {
    id: 'open_selected',
    label: 'Open Selected',
    variant: 'outline',
  },
];

