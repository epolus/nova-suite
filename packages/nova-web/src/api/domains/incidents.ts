/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { AssignmentGroupItem, Incident, IncidentProblemLink, IncidentStats, JournalEntry, Pagination, ServiceListItem, SimilarIncident, UserListItem } from '../types';

export const incidents = {
  list: (params: Record<string, string> = {}, page = 1, limit = 20) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...params });
    return request<{ incidents: Incident[]; pagination: Pagination }>(`/incidents?${qs}`);
  },
  get: (id: string) => request<Incident>(`/incidents/${id}`),
  create: (data: Partial<Incident>) =>
    request<Incident>('/incidents', { method: 'POST', body: JSON.stringify(data) }),
  createEss: (data: Partial<Incident>) =>
    request<Incident>('/incidents/ess', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Incident>) =>
    request<Incident>(`/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  journal: (id: string) => request<{ entries: JournalEntry[] }>(`/incidents/${id}/journal`),
  addJournal: (id: string, data: { entry_type: string; content: string; is_customer_visible: boolean }) =>
    request<JournalEntry>(`/incidents/${id}/journal`, { method: 'POST', body: JSON.stringify(data) }),
  nav: (currentId: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ current: currentId, ...params });
    return request<{ prev_id: string | null; next_id: string | null }>(`/incidents/nav?${qs}`);
  },
  callers: () => request<{ users: UserListItem[] }>('/incidents/callers'),
  services: () => request<{ services: ServiceListItem[] }>('/incidents/services'),
  linkedProblems: (incidentId: string) =>
    request<{ problems: IncidentProblemLink[] }>(`/incidents/${incidentId}/problems`),
  relateProblem: (incidentId: string, problemId: string, relationshipType = 'related_to') =>
    request<{ success: boolean }>(`/incidents/${incidentId}/problems`, {
      method: 'POST',
      body: JSON.stringify({ problem_id: problemId, relationship_type: relationshipType }),
    }),
  unrelateProblem: (incidentId: string, problemId: string) =>
    request<{ success: boolean }>(`/incidents/${incidentId}/problems/${problemId}`, { method: 'DELETE' }),
  similar: (id: string, params: { limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    return request<{ incidents: SimilarIncident[] }>(`/incidents/${id}/similar${qs.size ? `?${qs}` : ''}`);
  },
  similarByText: (params: { title?: string; description?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.title) qs.set('title', params.title);
    if (params.description) qs.set('description', params.description);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    return request<{ incidents: SimilarIncident[] }>(`/incidents/similar-by-text?${qs}`);
  },
  assignmentGroups: () => request<{ assignment_groups: AssignmentGroupItem[] }>('/incidents/assignment-groups'),
  bulkUpdate: (ids: string[], action: string, value?: string) =>
    request<{ success: boolean; updated: number }>('/incidents/bulk', {
      method: 'PATCH',
      body: JSON.stringify({ ids, action, value }),
    }),
  stats: () => request<IncidentStats>('/incidents/stats'),
  linkMajorIncident: (incidentId: string, body: { major_incident_id: string }) =>
    request<{ success: boolean; major_incident_id: string }>(`/incidents/${incidentId}/link-major-incident`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
