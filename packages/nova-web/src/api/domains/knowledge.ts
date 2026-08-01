/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { AssignmentGroupItem, KbArticleRatingSummary, KnowledgeApprovalWorkflow, KnowledgeArticle, KnowledgeArticleDetail, KnowledgeCategory, KnowledgeIncidentResolution, KnowledgeSuggestion } from '../types';

export const knowledge = {
  categories: () => request<{ categories: KnowledgeCategory[] }>('/knowledge/categories'),
  createCategory: (data: { name: string; description?: string | null; parent_id?: string | null; is_active?: boolean }) =>
    request<{ id: string }>('/knowledge/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: string, data: Partial<KnowledgeCategory>) =>
    request<{ success: boolean }>(`/knowledge/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCategory: (id: string) =>
    request<{ success: boolean }>(`/knowledge/categories/${id}`, { method: 'DELETE' }),
  assignmentGroups: () => request<{ assignment_groups: AssignmentGroupItem[] }>('/knowledge/assignment-groups'),
  workflows: () => request<{ workflows: KnowledgeApprovalWorkflow[] }>('/knowledge/workflows'),
  createWorkflow: (data: Partial<KnowledgeApprovalWorkflow>) =>
    request<{ id: string }>('/knowledge/workflows', { method: 'POST', body: JSON.stringify(data) }),
  updateWorkflow: (id: string, data: Partial<KnowledgeApprovalWorkflow>) =>
    request<{ success: boolean }>(`/knowledge/workflows/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteWorkflow: (id: string) =>
    request<{ success: boolean }>(`/knowledge/workflows/${id}`, { method: 'DELETE' }),
  articles: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params);
    return request<{ articles: KnowledgeArticle[] }>(`/knowledge/articles?${qs}`);
  },
  article: (id: string) => request<KnowledgeArticleDetail>(`/knowledge/articles/${id}`),
  createArticle: (data: Partial<KnowledgeArticle>) =>
    request<{ id: string }>('/knowledge/articles', { method: 'POST', body: JSON.stringify(data) }),
  updateArticle: (id: string, data: Partial<KnowledgeArticle>) =>
    request<{ success: boolean }>(`/knowledge/articles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  newVersion: (id: string) =>
    request<{ id: string }>(`/knowledge/articles/${id}/new-version`, { method: 'POST', body: JSON.stringify({}) }),
  submitForReview: (id: string) =>
    request<{ success: boolean; status: string }>(`/knowledge/articles/${id}/submit`, { method: 'POST', body: JSON.stringify({}) }),
  decideApproval: (articleId: string, approvalId: string, decision: 'approved' | 'rejected', notes?: string) =>
    request<{ success: boolean }>(`/knowledge/articles/${articleId}/approvals/${approvalId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, notes }),
    }),
  incidentResolutions: (incidentId: string) =>
    request<{ resolutions: KnowledgeIncidentResolution[] }>(`/knowledge/incidents/${incidentId}/resolutions`),
  linkIncidentResolution: (incidentId: string, kbId: string) =>
    request<{ success: boolean }>(`/knowledge/incidents/${incidentId}/resolutions`, {
      method: 'POST',
      body: JSON.stringify({ kb_id: kbId }),
    }),
  suggestionsForIncident: (incidentId: string, params: { limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    return request<{ articles: KnowledgeSuggestion[] }>(`/knowledge/incidents/${incidentId}/suggestions${qs.size ? `?${qs}` : ''}`);
  },
  suggestionsByText: (params: { title?: string; description?: string; category?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.title) qs.set('title', params.title);
    if (params.description) qs.set('description', params.description);
    if (params.category) qs.set('category', params.category);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    return request<{ articles: KnowledgeSuggestion[] }>(`/knowledge/suggestions-by-text?${qs}`);
  },
  ratings: (id: string) => request<KbArticleRatingSummary>(`/knowledge/articles/${id}/ratings`),
  rate: (id: string, rating: 1 | -1 | null) =>
    request<KbArticleRatingSummary>(`/knowledge/articles/${id}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    }),
};
