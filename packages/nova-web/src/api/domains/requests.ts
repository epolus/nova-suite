/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { Pagination, RequestTask, RequestTaskListItem, ServiceRequest } from '../types';

export const requests = {
  list: (params: Record<string, string> = {}, page = 1, limit = 20) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...params });
    return request<{ requests: ServiceRequest[]; pagination: Pagination }>(`/requests?${qs}`);
  },
  get: (id: string) => request<ServiceRequest>(`/requests/${id}`),
  nav: (currentId: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ current: currentId, ...params });
    return request<{ prev_id: string | null; next_id: string | null }>(`/requests/nav?${qs}`);
  },
  create: (data: {
    service_item_id: string;
    form_data?: Record<string, unknown>;
    priority?: string;
    notes?: string;
    requested_for?: string;
    delivery_info?: { location?: string; date_needed?: string; instructions?: string };
    batch_id?: string;
  }) => request<ServiceRequest>('/requests', { method: 'POST', body: JSON.stringify(data) }),
  batch: (data: {
    items: { service_item_id: string; form_data?: Record<string, unknown>; priority?: string; notes?: string }[];
    requested_for?: string;
    delivery_info?: { location?: string; date_needed?: string; instructions?: string };
  }) => request<{ batch_id: string; requests: ServiceRequest[] }>('/requests/batch', {
    method: 'POST', body: JSON.stringify(data),
  }),
  approve: (id: string, action: 'approve' | 'reject', notes?: string) =>
    request<ServiceRequest>(`/requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ action, notes }),
    }),
  tasks: (id: string) => request<{ tasks: RequestTask[] }>(`/requests/${id}/tasks`),
  task: (taskId: string) => request<RequestTaskListItem>(`/requests/tasks/${taskId}`),
  completeTask: (requestId: string, taskId: string, data: { outcome?: string; notes?: string }) =>
    request<RequestTask>(`/requests/${requestId}/tasks/${taskId}/complete`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  assignTask: (requestId: string, taskId: string) =>
    request<RequestTask>(`/requests/${requestId}/tasks/${taskId}/assign`, { method: 'POST' }),
  taskQueue: (params: Record<string, string> = {}, page = 1, limit = 20) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...params });
    return request<{ tasks: RequestTaskListItem[]; pagination: Pagination }>(`/requests/tasks?${qs}`);
  },
};
