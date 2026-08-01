/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ReportDatasetKey, ReportKpiMetric } from '../../api/client';

export const DATASET_LABELS: Record<ReportDatasetKey, string> = {
  incidents: 'Incidents',
  changes: 'Changes',
  requests: 'Requests',
};

type DatasetFieldConfig = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'timestamp';
  sortable?: boolean;
  groupable?: boolean;
};

export const DATASET_FIELDS: Record<ReportDatasetKey, DatasetFieldConfig[]> = {
  incidents: [
    { key: 'id', label: 'ID', type: 'text' },
    { key: 'number', label: 'Number', type: 'text', sortable: true },
    { key: 'title', label: 'Title', type: 'text', groupable: true },
    { key: 'status', label: 'Status', type: 'text', sortable: true, groupable: true },
    { key: 'priority', label: 'Priority', type: 'number', sortable: true, groupable: true },
    { key: 'category', label: 'Category', type: 'text', groupable: true },
    { key: 'sla_breached', label: 'SLA breached', type: 'boolean', sortable: true, groupable: true },
    { key: 'created_at', label: 'Created at', type: 'timestamp', sortable: true },
    { key: 'updated_at', label: 'Updated at', type: 'timestamp', sortable: true },
    { key: 'resolved_at', label: 'Resolved at', type: 'timestamp', sortable: true },
  ],
  changes: [
    { key: 'id', label: 'ID', type: 'text' },
    { key: 'number', label: 'Number', type: 'text', sortable: true },
    { key: 'title', label: 'Title', type: 'text', groupable: true },
    { key: 'status', label: 'Status', type: 'text', sortable: true, groupable: true },
    { key: 'risk_level', label: 'Risk level', type: 'text', sortable: true, groupable: true },
    { key: 'priority', label: 'Priority', type: 'text', sortable: true, groupable: true },
    { key: 'success', label: 'Success', type: 'boolean', groupable: true },
    { key: 'created_at', label: 'Created at', type: 'timestamp', sortable: true },
    { key: 'scheduled_start', label: 'Scheduled start', type: 'timestamp', sortable: true },
    { key: 'scheduled_end', label: 'Scheduled end', type: 'timestamp', sortable: true },
  ],
  requests: [
    { key: 'id', label: 'ID', type: 'text' },
    { key: 'number', label: 'Number', type: 'text', sortable: true },
    { key: 'status', label: 'Status', type: 'text', sortable: true, groupable: true },
    { key: 'priority', label: 'Priority', type: 'text', sortable: true, groupable: true },
    { key: 'service_item_id', label: 'Service item', type: 'text', groupable: true },
    { key: 'requester_id', label: 'Requester', type: 'text', groupable: true },
    { key: 'requested_for', label: 'Requested for', type: 'text', groupable: true },
    { key: 'approved_at', label: 'Approved at', type: 'timestamp', sortable: true },
    { key: 'created_at', label: 'Created at', type: 'timestamp', sortable: true },
    { key: 'updated_at', label: 'Updated at', type: 'timestamp', sortable: true },
  ],
};

export const KPI_METRICS: Array<{ value: ReportKpiMetric; label: string }> = [
  { value: 'count', label: 'Count' },
  { value: 'avg', label: 'Average' },
  { value: 'sum', label: 'Sum' },
];

