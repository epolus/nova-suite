/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { ReportActivityEvent, ReportComponentConfig, ReportComponentResult, ReportDefinitionDetail, ReportDefinitionSummary, ReportDefinitionUpsertPayload, ReportExport } from '../types';

export const reports = {
  kpis: () => request<{
    incidents: { open_count: number; sla_breached: number; mttr_hours: number | null };
    changes: { closed_count: number; successful_count: number; success_rate: number | null };
    requests: { open_count: number; backlog_age_hours: number | null };
    problems: { open_count: number };
  }>('/reports/kpis'),
  listDefinitions: () => request<{ reports: ReportDefinitionSummary[] }>('/reports/definitions'),
  getDefinition: (id: string) => request<{ report: ReportDefinitionDetail; can_edit: boolean }>(`/reports/definitions/${id}`),
  createDefinition: (body: ReportDefinitionUpsertPayload) =>
    request<{ report: ReportDefinitionDetail }>('/reports/definitions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateDefinition: (id: string, body: Partial<ReportDefinitionUpsertPayload>) =>
    request<{ report: ReportDefinitionDetail }>(`/reports/definitions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteDefinition: (id: string) =>
    request<void>(`/reports/definitions/${id}`, { method: 'DELETE' }),
  previewComponent: (component: ReportComponentConfig) =>
    request<{ preview: ReportComponentResult }>('/reports/preview', {
      method: 'POST',
      body: JSON.stringify({ component }),
    }),
  runDefinition: (id: string) =>
    request<{ report: { id: string; name: string; description: string | null; layout: Record<string, unknown> }; results: Array<{ component: ReportComponentConfig; result: ReportComponentResult }> }>(
      `/reports/definitions/${id}/run`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  activity: (params: { report_definition_id?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.report_definition_id) qs.set('report_definition_id', params.report_definition_id);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    return request<{ events: ReportActivityEvent[] }>(`/reports/activity${qs.size ? `?${qs}` : ''}`);
  },
  createExport: (report_key: 'incidents.sla' | 'changes.success') =>
    request<{ export: ReportExport }>('/reports/exports', {
      method: 'POST',
      body: JSON.stringify({ report_key }),
    }),
  createDefinitionExport: (report_definition_id: string) =>
    request<{ export: ReportExport }>('/reports/exports', {
      method: 'POST',
      body: JSON.stringify({ report_definition_id }),
    }),
  listExports: () => request<{ exports: ReportExport[] }>('/reports/exports'),
};
