/* SPDX-License-Identifier: AGPL-3.0-only */

export type DataManagementOperator = 'eq' | 'neq' | 'contains' | 'in' | 'gte' | 'lte' | 'older_than';
export type DataManagementFieldType = 'text' | 'number' | 'boolean' | 'timestamp';
export type DataManagementUnit = 'days' | 'months' | 'years';
export type DataManagementAction = 'delete' | 'archive';

export interface DataManagementField {
  key: string;
  type: DataManagementFieldType;
  operators: DataManagementOperator[];
}

export interface DataManagementTarget {
  key: 'incidents';
  actions: DataManagementAction[];
  fields: DataManagementField[];
}

export type DataManagementFilterValue =
  | string
  | number
  | boolean
  | Array<string | number | boolean>
  | { amount: number; unit: DataManagementUnit };

export interface DataManagementFilter {
  field: string;
  operator: DataManagementOperator;
  value: DataManagementFilterValue;
}

export interface DataManagementSample {
  number: string;
  title: string;
  status: string;
  created_at: string;
  closed_at: string | null;
}

export interface DataManagementJob {
  id: string;
  target: string;
  action: DataManagementAction;
  filters: DataManagementFilter[];
  include_open: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  match_count: number | null;
  affected_count: number;
  error: string | null;
  actor_name?: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface DataManagementPreview {
  count: number;
  sample: DataManagementSample[];
}
