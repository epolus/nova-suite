/* SPDX-License-Identifier: AGPL-3.0-only */
import type {
  CreateMajorIncidentInput,
  MajorIncidentRelatedInput,
  MajorIncidentResolveInput,
  MajorIncidentRoleInput,
  MajorIncidentStakeholderUpdateInput,
  PostmortemActionItemCreateInput,
  PostmortemFollowUpInput,
  PostmortemUpsertInput,
  PublishPostmortemInput,
  UpdateMajorIncidentInput,
} from '@nova-suite/shared/schemas';
import { request } from '../http';

export const majorIncidents = {
  activeBanner: () =>
    request<{ items: Record<string, unknown>[] }>('/major-incidents/active-banner'),
  list: (params: Record<string, string> = {}, page = 1, limit = 20) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...params });
    return request<{ major_incidents: Record<string, unknown>[]; page: number; limit: number; total: number }>(
      `/major-incidents?${qs}`,
    );
  },
  get: (id: string) =>
    request<{
      major_incident: Record<string, unknown>;
      participants: Record<string, unknown>[];
      stakeholder_updates: Record<string, unknown>[];
      events: Record<string, unknown>[];
      related_incidents: Record<string, unknown>[];
      postmortem: Record<string, unknown> | null;
      suggested_runbooks: Record<string, unknown>[];
      workflow_status: { phase: string; majorIncidentId: string } | null;
    }>(`/major-incidents/${id}`),
  create: (data: CreateMajorIncidentInput) =>
    request<{ major_incident: Record<string, unknown> }>('/major-incidents', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateMajorIncidentInput) =>
    request<{ major_incident: Record<string, unknown> }>(`/major-incidents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  addStakeholderUpdate: (id: string, data: MajorIncidentStakeholderUpdateInput) =>
    request<{ update: Record<string, unknown> }>(`/major-incidents/${id}/stakeholder-updates`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  assignRole: (id: string, data: MajorIncidentRoleInput) =>
    request<{ participant: Record<string, unknown> }>(`/major-incidents/${id}/roles`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  investigate: (id: string) =>
    request<{ major_incident: Record<string, unknown> }>(`/major-incidents/${id}/investigate`, { method: 'POST' }),
  addPostmortemActionItem: (id: string, body: PostmortemActionItemCreateInput) =>
    request<{ postmortem: Record<string, unknown> }>(`/major-incidents/${id}/postmortem/action-items`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createPostmortemFollowUp: (id: string, actionItemId: string, body: PostmortemFollowUpInput) =>
    request<{
      postmortem: Record<string, unknown>;
      already: boolean;
      kind: 'problem' | 'change';
      record_id: string;
      record_number?: string;
    }>(`/major-incidents/${id}/postmortem/action-items/${actionItemId}/follow-up`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  resolve: (id: string, body: MajorIncidentResolveInput) =>
    request<{ ok: boolean; major_incident?: Record<string, unknown> }>(`/major-incidents/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  acceptMajor: (id: string) =>
    request<{ major_incident: Record<string, unknown> }>(`/major-incidents/${id}/accept-major`, { method: 'POST' }),
  rejectPromotion: (id: string, body?: { reason?: string }) =>
    request<{ major_incident: Record<string, unknown> }>(`/major-incidents/${id}/reject-promotion`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  linkRelated: (id: string, data: MajorIncidentRelatedInput) =>
    request<{ link: Record<string, unknown> }>(`/major-incidents/${id}/related-incidents`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  suggestedRelated: (id: string) =>
    request<{ incidents: Record<string, unknown>[] }>(`/major-incidents/${id}/suggested-related`),
  getPostmortem: (id: string) =>
    request<{ postmortem: Record<string, unknown> | null }>(`/major-incidents/${id}/postmortem`),
  createPostmortem: (id: string, data: PostmortemUpsertInput) =>
    request<{ postmortem: Record<string, unknown> }>(`/major-incidents/${id}/postmortem`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  patchPostmortem: (id: string, data: PostmortemUpsertInput) =>
    request<{ postmortem: Record<string, unknown> }>(`/major-incidents/${id}/postmortem`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  publishPostmortem: (id: string, data: PublishPostmortemInput) =>
    request<{ postmortem: Record<string, unknown> }>(`/major-incidents/${id}/postmortem/publish`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
