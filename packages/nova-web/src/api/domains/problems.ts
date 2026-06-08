/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { AssignmentGroupItem, KnownError, Pagination, Problem, ProblemIncidentLink, ProblemTask } from '../types';

export const problems = {
  list: (params: Record<string, string> = {}, page = 1, limit = 20) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...params });
    return request<{ problems: Problem[]; pagination: Pagination }>(`/problems?${qs}`);
  },
  get: (id: string) => request<Problem>(`/problems/${id}`),
  create: (data: Partial<Problem>) =>
    request<Problem>('/problems', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Problem>) =>
    request<Problem>(`/problems/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  nav: (currentId: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ current: currentId, ...params });
    return request<{ prev_id: string | null; next_id: string | null }>(`/problems/nav?${qs}`);
  },
  assignmentGroups: () => request<{ assignment_groups: AssignmentGroupItem[] }>('/problems/assignment-groups'),
  searchIncidents: (q: string) =>
    request<{ incidents: Array<{ id: string; number: string; title: string; status: string }> }>(`/problems/incidents/search?q=${encodeURIComponent(q)}`),
  linkedIncidents: (problemId: string) =>
    request<{ incidents: ProblemIncidentLink[] }>(`/problems/${problemId}/incidents`),
  linkIncident: (problemId: string, incidentId: string, relationshipType = 'caused_by') =>
    request<{ success: boolean }>(`/problems/${problemId}/incidents`, {
      method: 'POST',
      body: JSON.stringify({ incident_id: incidentId, relationship_type: relationshipType }),
    }),
  unlinkIncident: (problemId: string, incidentId: string) =>
    request<{ success: boolean }>(`/problems/${problemId}/incidents/${incidentId}`, { method: 'DELETE' }),
  tasks: (problemId: string) =>
    request<{ tasks: ProblemTask[] }>(`/problems/${problemId}/tasks`),
  createTask: (problemId: string, data: Partial<ProblemTask>) =>
    request<ProblemTask>(`/problems/${problemId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (problemId: string, taskId: string, data: Partial<ProblemTask>) =>
    request<ProblemTask>(`/problems/${problemId}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTask: (problemId: string, taskId: string) =>
    request<{ success: boolean }>(`/problems/${problemId}/tasks/${taskId}`, { method: 'DELETE' }),
  knownErrors: (problemId: string) =>
    request<{ known_errors: KnownError[] }>(`/problems/${problemId}/known-errors`),
  createKnownError: (problemId: string, data: Partial<KnownError>) =>
    request<KnownError>(`/problems/${problemId}/known-errors`, { method: 'POST', body: JSON.stringify(data) }),
  updateKnownError: (problemId: string, knownErrorId: string, data: Partial<KnownError>) =>
    request<KnownError>(`/problems/${problemId}/known-errors/${knownErrorId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  byCi: (ciId: string) => request<{ problems: Problem[] }>(`/problems/by-ci/${ciId}`),
};
