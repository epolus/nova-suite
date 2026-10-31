/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { AlertDefinition, AlertDetail, AlertEvent, AlertListItem } from '../types/alerts';
import type { AssignmentGroupItem, Pagination } from '../types';

export const alerts = {
  list: (params: Record<string, string> = {}, page = 1, limit = 20) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...params });
    return request<{ alerts: AlertListItem[]; pagination: Pagination }>(`/alerts?${qs}`);
  },
  get: (id: string) => request<{ alert: AlertDetail; events: AlertEvent[] }>(`/alerts/${id}`),
  definitions: () => request<{ alert_definitions: AlertDefinition[] }>('/alerts/definitions'),
  assignmentGroups: () => request<{ assignment_groups: AssignmentGroupItem[] }>('/alerts/assignment-groups'),
  createDefinition: (data: {
    name: string;
    description?: string | null;
    source?: string | null;
    severity?: string | null;
    action: 'none' | 'incident' | 'workflow';
    impact?: string | null;
    urgency?: string | null;
    assignment_group_id?: string | null;
    match_labels?: Record<string, string>;
    sort_order?: number;
  }) => request<AlertDefinition>('/alerts/definitions', { method: 'POST', body: JSON.stringify(data) }),
  updateDefinition: (id: string, data: {
    is_active?: boolean;
    name?: string;
    description?: string | null;
    source?: string | null;
    severity?: string | null;
    action?: 'none' | 'incident' | 'workflow';
    impact?: string | null;
    urgency?: string | null;
    assignment_group_id?: string | null;
    match_labels?: Record<string, string>;
    sort_order?: number;
  }) => request<AlertDefinition>(`/alerts/definitions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};
