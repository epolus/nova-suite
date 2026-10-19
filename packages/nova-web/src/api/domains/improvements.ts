/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { Improvement, ImprovementJournalEntry } from '../types';

export type ImprovementSource = 'postmortem' | 'change' | 'problem';

export const improvements = {
  list: () => request<{ improvements: Improvement[] }>('/improvements'),
  get: (id: string) => request<Improvement>(`/improvements/${id}`),
  create: (data: { title: string; description?: string | null }) =>
    request<{ id: string; number: string }>('/improvements', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Pick<Improvement, 'title' | 'description' | 'status' | 'owner_user_id'>>) =>
    request<Improvement>(`/improvements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  source: (sourceType: ImprovementSource, sourceId: string, actionItemId?: string) => {
    const params = new URLSearchParams({ source_type: sourceType, source_id: sourceId });
    if (actionItemId) params.set('action_item_id', actionItemId);
    return request<{ improvement: Improvement | null }>(`/improvements/source?${params.toString()}`);
  },
  fromPostmortem: (majorIncidentId: string, actionItemId: string) =>
    request<{ id: string; number?: string; already: boolean }>('/improvements/from-postmortem', {
      method: 'POST',
      body: JSON.stringify({ major_incident_id: majorIncidentId, action_item_id: actionItemId }),
    }),
  fromChange: (changeId: string) =>
    request<{ id: string; number?: string; already: boolean }>('/improvements/from-change', {
      method: 'POST',
      body: JSON.stringify({ change_id: changeId }),
    }),
  fromProblem: (problemId: string) =>
    request<{ id: string; number?: string; already: boolean }>('/improvements/from-problem', {
      method: 'POST',
      body: JSON.stringify({ problem_id: problemId }),
    }),
  journal: (id: string) => request<{ entries: ImprovementJournalEntry[] }>(`/improvements/${id}/journal`),
  addJournal: (id: string, data: { entry_type: 'comment' | 'work_note'; content: string }) =>
    request<ImprovementJournalEntry>(`/improvements/${id}/journal`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
