/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { HistoryEvent, TemporalOverview, WorkflowDetail, WorkflowExecution } from '../types';

export const temporal = {
  overview: () => request<TemporalOverview>('/temporal/overview'),
  workflows: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params);
    return request<{ workflows: WorkflowExecution[]; nextPageToken: string | null }>(`/temporal/workflows?${qs}`);
  },
  workflow: (workflowId: string, runId: string) =>
    request<WorkflowDetail>(`/temporal/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(runId)}`),
  history: (workflowId: string, runId: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params);
    return request<{ events: HistoryEvent[]; nextPageToken: string | null }>(
      `/temporal/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(runId)}/history?${qs}`,
    );
  },
  terminate: (workflowId: string, runId: string, reason?: string) =>
    request<{ success: boolean }>(
      `/temporal/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(runId)}/terminate`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    ),
  cancel: (workflowId: string, runId: string) =>
    request<{ success: boolean }>(
      `/temporal/workflows/${encodeURIComponent(workflowId)}/${encodeURIComponent(runId)}/cancel`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
};
