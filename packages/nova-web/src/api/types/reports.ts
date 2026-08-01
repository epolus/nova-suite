/* SPDX-License-Identifier: AGPL-3.0-only */
export interface ReportExport {
  id: string;
  report_key: string;
  status: string;
  row_count: number;
  generated_at: string;
  created_by: string | null;
}

export type ReportDatasetKey = 'incidents' | 'changes' | 'requests';
export type ReportComponentType = 'table' | 'kpi' | 'bar_chart' | 'pie_chart';
export type ReportFilterOperator = 'eq' | 'neq' | 'contains' | 'in' | 'gte' | 'lte';
export type ReportSortDirection = 'asc' | 'desc';
export type ReportKpiMetric = 'count' | 'avg' | 'sum';

export interface ReportFilter {
  field: string;
  operator: ReportFilterOperator;
  value: string | number | boolean | Array<string | number | boolean>;
}

export interface ReportSort {
  field: string;
  direction?: ReportSortDirection;
}

export interface TableReportComponent {
  id: string;
  type: 'table';
  title: string;
  dataset: ReportDatasetKey;
  columns: string[];
  filters?: ReportFilter[];
  sort?: ReportSort | null;
  limit?: number;
}

export interface KpiReportComponent {
  id: string;
  type: 'kpi';
  title: string;
  dataset: ReportDatasetKey;
  metric: ReportKpiMetric;
  metric_field?: string;
  filters?: ReportFilter[];
}

export interface ChartReportComponent {
  id: string;
  type: 'bar_chart' | 'pie_chart';
  title: string;
  dataset: ReportDatasetKey;
  group_by: string;
  metric: ReportKpiMetric;
  metric_field?: string;
  filters?: ReportFilter[];
  top_n?: number;
}

export type ReportComponentConfig = TableReportComponent | KpiReportComponent | ChartReportComponent;

export interface ReportDefinitionSummary {
  id: string;
  name: string;
  description: string | null;
  is_shared: boolean;
  allowed_roles: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  version: number;
  can_edit: boolean;
}

export interface ReportDefinitionDetail extends ReportDefinitionSummary {
  layout: Record<string, unknown>;
  components: ReportComponentConfig[];
  default_filters: Record<string, unknown>;
  updated_by: string | null;
  tenant_id: string;
}

export interface ReportDefinitionUpsertPayload {
  name: string;
  description?: string | null;
  is_shared?: boolean;
  allowed_roles?: string[];
  layout?: Record<string, unknown>;
  components?: ReportComponentConfig[];
  default_filters?: Record<string, unknown>;
}

export type ReportComponentResult = {
  type: 'table';
  dataset: ReportDatasetKey;
  row_count: number;
  rows: Array<Record<string, unknown>>;
} | {
  type: 'kpi';
  dataset: ReportDatasetKey;
  metric: ReportKpiMetric;
  value: number | null;
} | {
  type: 'bar_chart' | 'pie_chart';
  dataset: ReportDatasetKey;
  group_by: string;
  metric: ReportKpiMetric;
  points: Array<{ raw_label: string | number | boolean | null; label: string; value: number }>;
};

export interface ReportActivityEvent {
  id: string;
  report_definition_id: string | null;
  report_name: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
