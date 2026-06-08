/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { AssignmentGroupItem, CabMeeting, Change, ChangeBlackout, ChangeConflict, ChangeDetail, ChangeStats, ChangeType, Pagination, StandardChangeTemplate } from '../types';

export const changes = {
  list: (params: Record<string, string> = {}, page = 1, limit = 20) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...params });
    return request<{ changes: Change[]; pagination: Pagination }>(`/changes?${qs}`);
  },
  get: (id: string) => request<ChangeDetail>(`/changes/${id}`),
  create: (data: Partial<Change>) =>
    request<Change>('/changes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Change>) =>
    request<Change>(`/changes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  nav: (currentId: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ current: currentId, ...params });
    return request<{ prev_id: string | null; next_id: string | null }>(`/changes/nav?${qs}`);
  },
  assignmentGroups: () => request<{ assignment_groups: AssignmentGroupItem[] }>('/changes/assignment-groups'),
  types: () => request<{ change_types: ChangeType[] }>('/changes/types'),
  createType: (data: Partial<ChangeType>) =>
    request<ChangeType>('/changes/types', { method: 'POST', body: JSON.stringify(data) }),
  updateType: (id: string, data: Partial<ChangeType>) =>
    request<ChangeType>(`/changes/types/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  standardTemplates: () => request<{ templates: StandardChangeTemplate[] }>('/changes/standard-templates'),
  createStandardTemplate: (data: Partial<StandardChangeTemplate>) =>
    request<StandardChangeTemplate>('/changes/standard-templates', { method: 'POST', body: JSON.stringify(data) }),
  updateStandardTemplate: (id: string, data: Partial<StandardChangeTemplate>) =>
    request<StandardChangeTemplate>(`/changes/standard-templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  cabMeetings: () => request<{ meetings: CabMeeting[] }>('/changes/cab-meetings'),
  createCabMeeting: (data: Partial<CabMeeting>) =>
    request<CabMeeting>('/changes/cab-meetings', { method: 'POST', body: JSON.stringify(data) }),
  addToCabMeeting: (meetingId: string, changeId: string) =>
    request<{ success: boolean }>(`/changes/cab-meetings/${meetingId}/changes/${changeId}`, { method: 'POST' }),
  decideCabMeetingChange: (meetingId: string, changeId: string, decision: 'approved' | 'rejected' | 'deferred', notes?: string) =>
    request<{ success: boolean }>(`/changes/cab-meetings/${meetingId}/changes/${changeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ decision, notes }),
    }),
  blackouts: () => request<{ blackouts: ChangeBlackout[] }>('/changes/blackouts'),
  createBlackout: (data: Partial<ChangeBlackout>) =>
    request<ChangeBlackout>('/changes/blackouts', { method: 'POST', body: JSON.stringify(data) }),
  updateBlackout: (id: string, data: Partial<ChangeBlackout>) =>
    request<ChangeBlackout>(`/changes/blackouts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  calendar: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params);
    return request<{ changes: Change[]; blackouts: ChangeBlackout[] }>(`/changes/calendar?${qs}`);
  },
  conflicts: (id: string) => request<{ conflicts: ChangeConflict[] }>(`/changes/conflicts/${id}`),
  transition: (id: string, data: { action: string; notes?: string; scheduled_start?: string | null; scheduled_end?: string | null }) =>
    request<Change>(`/changes/${id}/transition`, { method: 'POST', body: JSON.stringify(data) }),
  decideApproval: (changeId: string, approvalId: string, decision: 'approved' | 'rejected' | 'waived', notes?: string) =>
    request<{ success: boolean }>(`/changes/${changeId}/approvals/${approvalId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, notes }),
    }),
  stats: () => request<ChangeStats>('/changes/stats'),
};
