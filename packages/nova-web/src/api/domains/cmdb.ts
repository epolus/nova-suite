/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { CI, CIClass, CIHistoryEntry, CIRelationship, ImpactedCI, Pagination } from '../types';

export const cmdb = {
  classes: () => request<{ classes: CIClass[] }>('/cmdb/classes'),
  createClass: (data: Partial<CIClass>) =>
    request<CIClass>('/cmdb/classes', { method: 'POST', body: JSON.stringify(data) }),
  updateClass: (id: string, data: Partial<CIClass>) =>
    request<CIClass>(`/cmdb/classes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteClass: (id: string) =>
    request<void>(`/cmdb/classes/${id}`, { method: 'DELETE' }),
  items: (params: Record<string, string> = {}, page = 1, limit = 20) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...params });
    return request<{ items: CI[]; pagination: Pagination }>(`/cmdb/items?${qs}`);
  },
  item: (id: string) => request<CI & { relationships: { outgoing: CIRelationship[]; incoming: CIRelationship[] } }>(`/cmdb/items/${id}`),
  createItem: (data: Partial<CI>) =>
    request<CI>('/cmdb/items', { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (id: string, data: Partial<CI>) =>
    request<CI>(`/cmdb/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  itemHistory: (id: string) => request<{ history: CIHistoryEntry[] }>(`/cmdb/items/${id}/history`),
  impact: (id: string, depth = 5) =>
    request<{ source_ci_id: string; impacted_items: ImpactedCI[]; total: number }>(
      `/cmdb/items/${id}/impact?depth=${depth}`,
    ),
  relationships: () => request<{ relationships: CIRelationship[] }>('/cmdb/relationships'),
  createRelationship: (data: { source_ci_id: string; target_ci_id: string; relationship_type: string; notes?: string }) =>
    request<CIRelationship>('/cmdb/relationships', { method: 'POST', body: JSON.stringify(data) }),
  deleteRelationship: (id: string) =>
    request<void>(`/cmdb/relationships/${id}`, { method: 'DELETE' }),
  nav: (currentId: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ current: currentId, ...params });
    return request<{ prev_id: string | null; next_id: string | null }>(`/cmdb/items/nav?${qs}`);
  },
};
