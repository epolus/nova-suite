/* SPDX-License-Identifier: AGPL-3.0-only */
export interface KnowledgeCategory {
  id: string;
  name: string;
  description: string | null;
  parent_id?: string | null;
  parent_name?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeApprovalWorkflow {
  id: string;
  name: string;
  category_id: string | null;
  category_name?: string;
  steps: { step_order: number; assignment_group_id: string }[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeArticle {
  id: string;
  number: string;
  title: string;
  content: string;
  category_id: string | null;
  category_name?: string;
  assignment_group_id?: string | null;
  assignment_group_name?: string | null;
  root_article_id?: string | null;
  previous_version_id?: string | null;
  version_no?: number;
  status: 'draft' | 'review' | 'published' | 'retired';
  author_id: string | null;
  author_name?: string;
  view_count: number;
  meta_data: Record<string, unknown>;
  pending_approval_count?: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeArticleApproval {
  id: string;
  article_id: string;
  step_order: number;
  assignment_group_id: string;
  assignment_group_name?: string;
  status: 'pending' | 'approved' | 'rejected';
  decided_by: string | null;
  decided_by_name?: string;
  decided_at: string | null;
  notes: string | null;
}

export interface KnowledgeArticleDetail extends KnowledgeArticle {
  approvals: KnowledgeArticleApproval[];
  versions?: Array<{ id: string; number: string; status: string; version_no: number; updated_at: string }>;
}

export interface KnowledgeIncidentResolution {
  incident_id: string;
  kb_id: string;
  kb_number: string;
  kb_title: string;
  kb_status: string;
  resolved_by: string | null;
  resolved_by_name?: string;
  applied_at: string;
}

export interface KnowledgeSuggestion {
  id: string;
  number: string;
  title: string;
  excerpt: string;
  category_id: string | null;
  category_name?: string | null;
  updated_at: string;
  view_count: number;
  resolution_count: number;
  suggestion_score: number;
}

export interface KbArticleRatingSummary {
  thumbs_up: number;
  thumbs_down: number;
  my_rating: 1 | -1 | null;
}
