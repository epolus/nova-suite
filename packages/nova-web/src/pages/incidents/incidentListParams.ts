/* SPDX-License-Identifier: AGPL-3.0-only */
export interface FilterPreset {
  id: string;
  name: string;
  search: string;
  status: string;
  columnFilters: Record<string, string>;
}

export const PRESETS_KEY = 'nova_filter_presets_incidents';

export const DEFAULT_COLS = ['number', 'title', 'priority', 'status', 'assigned_to_name', 'sla', 'created_at'];

export function createIncidentListParams(args: {
  statusFilter: string;
  assignedToMe: boolean;
  slaBreached: boolean;
  search: string;
  sort: string;
  dir: string;
  columnFilters: Record<string, string>;
}): Record<string, string> {
  const apiParams: Record<string, string> = {};
  if (args.assignedToMe) {
    apiParams.assigned_to_me = 'true';
  }
  if (args.statusFilter === 'active') {
    apiParams.status_not_in = 'closed,cancelled';
  } else if (args.statusFilter !== 'all') {
    apiParams.status = args.statusFilter;
  }
  if (args.slaBreached) {
    apiParams.sla_breached = 'true';
  }
  if (args.search) apiParams.search = args.search;
  if (args.sort) {
    const sortKey = args.sort === 'sla' ? 'sla_due_at' : args.sort;
    apiParams.sort_by = sortKey;
    apiParams.sort_dir = args.dir;
  }
  for (const [col, val] of Object.entries(args.columnFilters)) {
    if (val) apiParams[`cf.${col}`] = val;
  }
  return apiParams;
}
