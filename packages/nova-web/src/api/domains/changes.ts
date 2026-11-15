/* SPDX-License-Identifier: AGPL-3.0-only */
import type {
  AddChangeJournalEntryInput,
  ChangeApprovalDecisionInput,
  ChangeTransitionInput,
  CreateBlackoutInput,
  CreateCabMeetingInput,
  CreateChangeInput,
  CreateChangeRiskQuestionInput,
  CreateChangeTypeInput,
  SubmitChangeRiskAssessmentInput,
  UpdateBlackoutInput,
  UpdateChangeInput,
  UpdateChangeRiskQuestionInput,
  UpdateChangeTypeInput,
} from '@nova-suite/shared/schemas';
import { request } from '../http';
import type {
  AssignmentGroupItem,
  CabMeeting,
  Change,
  ChangeAuditEntry,
  ChangeBlackout,
  ChangeConflict,
  ChangeDetail,
  ChangeJournalEntry,
  ChangeRiskAnswer,
  ChangeRiskQuestion,
  ChangeStats,
  ChangeType,
  Pagination,
  StandardChangeTemplate,
} from '../types';

export const changes = {
  list: (params: Record<string, string> = {}, page = 1, limit = 20) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...params });
    return request<{ changes: Change[]; pagination: Pagination }>(`/changes?${qs}`);
  },
  get: (id: string) => request<ChangeDetail>(`/changes/${id}`),
  create: (data: CreateChangeInput) =>
    request<Change>('/changes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: UpdateChangeInput) =>
    request<Change>(`/changes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  nav: (currentId: string, params: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ current: currentId, ...params });
    return request<{ prev_id: string | null; next_id: string | null }>(`/changes/nav?${qs}`);
  },
  assignmentGroups: () => request<{ assignment_groups: AssignmentGroupItem[] }>('/changes/assignment-groups'),
  types: () => request<{ change_types: ChangeType[] }>('/changes/types'),
  createType: (data: CreateChangeTypeInput) =>
    request<ChangeType>('/changes/types', { method: 'POST', body: JSON.stringify(data) }),
  updateType: (id: string, data: UpdateChangeTypeInput) =>
    request<ChangeType>(`/changes/types/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  standardTemplates: () => request<{ templates: StandardChangeTemplate[] }>('/changes/standard-templates'),
  createStandardTemplate: (data: Partial<StandardChangeTemplate>) =>
    request<StandardChangeTemplate>('/changes/standard-templates', { method: 'POST', body: JSON.stringify(data) }),
  updateStandardTemplate: (id: string, data: Partial<StandardChangeTemplate>) =>
    request<StandardChangeTemplate>(`/changes/standard-templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  cabMeetings: () => request<{ meetings: CabMeeting[] }>('/changes/cab-meetings'),
  createCabMeeting: (data: CreateCabMeetingInput) =>
    request<CabMeeting>('/changes/cab-meetings', { method: 'POST', body: JSON.stringify(data) }),
  addToCabMeeting: (meetingId: string, changeId: string) =>
    request<{ success: boolean }>(`/changes/cab-meetings/${meetingId}/changes/${changeId}`, { method: 'POST' }),
  decideCabMeetingChange: (meetingId: string, changeId: string, decision: 'approved' | 'rejected' | 'deferred', notes?: string) =>
    request<{ success: boolean }>(`/changes/cab-meetings/${meetingId}/changes/${changeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ decision, notes }),
    }),
  blackouts: () => request<{ blackouts: ChangeBlackout[] }>('/changes/blackouts'),
  createBlackout: (data: CreateBlackoutInput) =>
    request<ChangeBlackout>('/changes/blackouts', { method: 'POST', body: JSON.stringify(data) }),
  updateBlackout: (id: string, data: UpdateBlackoutInput) =>
    request<ChangeBlackout>(`/changes/blackouts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  calendar: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params);
    return request<{ changes: Change[]; blackouts: ChangeBlackout[] }>(`/changes/calendar?${qs}`);
  },
  conflicts: (id: string) => request<{ conflicts: ChangeConflict[] }>(`/changes/conflicts/${id}`),
  riskQuestions: (includeInactive = false) => {
    const qs = includeInactive ? '?include_inactive=true' : '';
    return request<{ questions: ChangeRiskQuestion[] }>(`/changes/risk-questions${qs}`);
  },
  createRiskQuestion: (data: CreateChangeRiskQuestionInput) =>
    request<ChangeRiskQuestion>('/changes/risk-questions', { method: 'POST', body: JSON.stringify(data) }),
  updateRiskQuestion: (id: string, data: UpdateChangeRiskQuestionInput) =>
    request<ChangeRiskQuestion>(`/changes/risk-questions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteRiskQuestion: (id: string) =>
    request<ChangeRiskQuestion>(`/changes/risk-questions/${id}`, { method: 'DELETE' }),
  riskAnswers: (changeId: string) =>
    request<{
      answers: ChangeRiskAnswer[];
      risk_score: number | null;
      risk_level: Change['risk_level'];
      suggested_risk_level: Change['risk_level'] | null;
    }>(`/changes/${changeId}/risk-answers`),
  submitRiskAssessment: (changeId: string, data: SubmitChangeRiskAssessmentInput) =>
    request<{
      risk_score: number;
      risk_level: Change['risk_level'];
      suggested_risk_level: Change['risk_level'];
      answers_saved: number;
    }>(`/changes/${changeId}/risk-assessment`, { method: 'POST', body: JSON.stringify(data) }),
  transition: (id: string, data: ChangeTransitionInput) =>
    request<Change>(`/changes/${id}/transition`, { method: 'POST', body: JSON.stringify(data) }),
  decideApproval: (
    changeId: string,
    approvalId: string,
    decision: ChangeApprovalDecisionInput['decision'],
    notes?: string,
  ) =>
    request<{ success: boolean }>(`/changes/${changeId}/approvals/${approvalId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, notes } satisfies ChangeApprovalDecisionInput),
    }),
  stats: () => request<ChangeStats>('/changes/stats'),
  journal: (id: string) =>
    request<{ entries: ChangeJournalEntry[] }>(`/changes/${id}/journal`),
  addJournal: (id: string, data: AddChangeJournalEntryInput) =>
    request<ChangeJournalEntry>(`/changes/${id}/journal`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  audit: (id: string) =>
    request<{ entries: ChangeAuditEntry[] }>(`/changes/${id}/audit`),
};
