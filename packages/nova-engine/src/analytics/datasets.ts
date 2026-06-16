/* SPDX-License-Identifier: AGPL-3.0-only */

import { AppError } from '../middleware/errorHandler';

export type ReportDatasetKey = 'incidents' | 'changes' | 'requests';

type FieldType = 'text' | 'number' | 'boolean' | 'timestamp';

export type DatasetField = {
  sql: string;
  type: FieldType;
  sortable?: boolean;
  groupable?: boolean;
};

export type DatasetSpec = {
  table: string;
  fields: Record<string, DatasetField>;
};

export const ANALYTICS_DATASETS: Record<ReportDatasetKey, DatasetSpec> = {
  incidents: {
    table: 'incidents',
    fields: {
      id: { sql: 't.id', type: 'text' },
      number: { sql: 't.number', type: 'text', sortable: true },
      title: { sql: 't.title', type: 'text', sortable: true, groupable: true },
      status: { sql: 't.status', type: 'text', sortable: true, groupable: true },
      priority: { sql: 't.priority', type: 'number', sortable: true, groupable: true },
      category: { sql: 't.category', type: 'text', sortable: true, groupable: true },
      sla_breached: { sql: 't.sla_breached', type: 'boolean', sortable: true, groupable: true },
      created_at: { sql: 't.created_at', type: 'timestamp', sortable: true },
      updated_at: { sql: 't.updated_at', type: 'timestamp', sortable: true },
      resolved_at: { sql: 't.resolved_at', type: 'timestamp', sortable: true },
      assigned_to: { sql: 't.assigned_to', type: 'text', groupable: true },
      caller_id: { sql: 't.caller_id', type: 'text', groupable: true },
    },
  },
  changes: {
    table: 'changes',
    fields: {
      id: { sql: 't.id', type: 'text' },
      number: { sql: 't.number', type: 'text', sortable: true },
      title: { sql: 't.title', type: 'text', sortable: true, groupable: true },
      status: { sql: 't.status', type: 'text', sortable: true, groupable: true },
      risk_level: { sql: 't.risk_level', type: 'text', sortable: true, groupable: true },
      priority: { sql: 't.priority', type: 'text', sortable: true, groupable: true },
      success: { sql: 't.success', type: 'boolean', sortable: true, groupable: true },
      created_at: { sql: 't.created_at', type: 'timestamp', sortable: true },
      updated_at: { sql: 't.updated_at', type: 'timestamp', sortable: true },
      scheduled_start: { sql: 't.scheduled_start', type: 'timestamp', sortable: true },
      scheduled_end: { sql: 't.scheduled_end', type: 'timestamp', sortable: true },
      assigned_to: { sql: 't.assigned_to', type: 'text', groupable: true },
      requested_by: { sql: 't.requested_by', type: 'text', groupable: true },
    },
  },
  requests: {
    table: 'requests',
    fields: {
      id: { sql: 't.id', type: 'text' },
      number: { sql: 't.number', type: 'text', sortable: true },
      status: { sql: 't.status', type: 'text', sortable: true, groupable: true },
      priority: { sql: 't.priority', type: 'text', sortable: true, groupable: true },
      service_item_id: { sql: 't.service_item_id', type: 'text', groupable: true },
      requester_id: { sql: 't.requester_id', type: 'text', groupable: true },
      requested_for: { sql: 't.requested_for', type: 'text', groupable: true },
      approved_at: { sql: 't.approved_at', type: 'timestamp', sortable: true },
      created_at: { sql: 't.created_at', type: 'timestamp', sortable: true },
      updated_at: { sql: 't.updated_at', type: 'timestamp', sortable: true },
    },
  },
};

export function ensureDataset(dataset: string): DatasetSpec {
  if (!(dataset in ANALYTICS_DATASETS)) {
    throw new AppError(400, `Unsupported dataset "${dataset}"`);
  }
  return ANALYTICS_DATASETS[dataset as ReportDatasetKey];
}

export function isReportDatasetKey(value: string): value is ReportDatasetKey {
  return value in ANALYTICS_DATASETS;
}
