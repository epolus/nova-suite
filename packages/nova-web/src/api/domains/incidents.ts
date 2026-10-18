/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { AssignmentGroupItem, Incident, IncidentAiSuggestion, IncidentProblemLink, IncidentStats, JournalEntry, KnownErrorSuggestion, Pagination, ServiceListItem, SimilarIncident, UserListItem } from '../types';

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
  knownErrors: (id: string) =>
    request<{ known_errors: KnownErrorSuggestion[] }>(`/incidents/${id}/known-errors`),
  knownErrorsByContext: (params: { configuration_item_id?: string; service_id?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.configuration_item_id) qs.set('configuration_item_id', params.configuration_item_id);
    if (params.service_id) qs.set('service_id', params.service_id);
    return request<{ known_errors: KnownErrorSuggestion[] }>(`/incidents/known-errors-by-context?${qs}`);
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
  byCi: (ciId: string) => request<{ incidents: Incident[] }>(`/incidents/by-ci/${ciId}`),
  linkMajorIncident: (incidentId: string, body: { major_incident_id: string }) =>
    request<{ success: boolean; major_incident_id: string }>(`/incidents/${incidentId}/link-major-incident`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  aiSuggestions: (id: string) =>
    request<{ suggestions: IncidentAiSuggestion[] }>(`/incidents/${id}/ai-suggestions`),
  acceptAiSuggestion: (incidentId: string, suggestionId: string) =>
    request<{ suggestion_id: string; status: string; incident: Incident }>(
      `/incidents/${incidentId}/ai-suggestions/${suggestionId}/accept`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
  rejectAiSuggestion: (incidentId: string, suggestionId: string) =>
    request<{ suggestion_id: string; status: string }>(
      `/incidents/${incidentId}/ai-suggestions/${suggestionId}/reject`,
      { method: 'POST', body: JSON.stringify({}) },
    ),
};
