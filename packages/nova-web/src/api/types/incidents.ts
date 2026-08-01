/* SPDX-License-Identifier: AGPL-3.0-only */
export interface Incident {
  id: string;
  number: string;
  request_id: string | null;
  title: string;
  description: string | null;
  status: string;
  impact: string;
  urgency: string;
  priority: number;
  assigned_to: string | null;
  assignment_group_id: string | null;
  caller_id: string | null;
  contact_info: string | null;
  service_id: string | null;
  configuration_item_id: string | null;
  category: string | null;
  subcategory: string | null;
  resolution_code: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  sla_due_at: string | null;
  sla_breached: boolean;
  created_at: string;
  updated_at: string;
  assigned_to_name?: string;
  assignment_group_name?: string;
  caller_name?: string;
  caller_email?: string;
  caller_phone?: string;
  caller_mobile?: string;
  caller_department_name?: string;
  service_name?: string;
  ci_name?: string;
  ci_display_name?: string;
  linked_major_incidents?: Array<{
    id: string;
    number?: string;
    title: string;
    status: string;
    link_kind: 'primary' | 'related';
  }>;
}

export interface IncidentProblemLink {
  problem_id: string;
  incident_id: string;
  relationship_type: 'caused_by' | 'related_to' | 'symptom_of';
  created_at: string;
  problem_number?: string;
  problem_title?: string;
  problem_status?: string;
  problem_priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface SimilarIncident {
  id: string;
  number: string;
  title: string;
  status: string;
  priority: number;
  category: string | null;
  subcategory: string | null;
  service_id: string | null;
  service_name?: string | null;
  configuration_item_id: string | null;
  ci_name?: string | null;
  ci_display_name?: string | null;
  similarity_score: number;
  created_at: string;
  updated_at: string;
}

export interface IncidentStats {
  open_total: number;
  sla_breached: number;
  assigned_to_me: number;
  by_priority: Array<{ priority: number; label: string; count: number }>;
}

export interface JournalEntry {
  id: string;
  incident_id: string;
  author_id: string;
  entry_type: string;
  content: string;
  is_customer_visible: boolean;
  created_at: string;
  author_name?: string;
}
