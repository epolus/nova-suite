/* SPDX-License-Identifier: AGPL-3.0-only */
export interface Problem {
  id: string;
  number: string;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  impact: 'low' | 'medium' | 'high';
  category: string | null;
  status: 'new' | 'investigating' | 'root_cause_identified' | 'fix_in_progress' | 'resolved' | 'closed' | 'known_error';
  root_cause: string | null;
  symptoms: string | null;
  workaround: string | null;
  permanent_fix: string | null;
  reported_by: string;
  assigned_to: string | null;
  assignment_group_id: string | null;
  affected_ci: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  sla_due_at?: string | null;
  sla_breached?: boolean;
  created_at: string;
  updated_at: string;
  reported_by_name?: string;
  assigned_to_name?: string;
  assignment_group_name?: string;
  affected_ci_name?: string;
  incident_count?: number;
  open_incident_count?: number;
}

export interface ProblemIncidentLink {
  problem_id: string;
  incident_id: string;
  relationship_type: 'caused_by' | 'related_to' | 'symptom_of';
  created_at: string;
  incident_number?: string;
  incident_title?: string;
  incident_status?: string;
}

export interface ProblemTask {
  id: string;
  problem_id: string;
  title: string;
  description: string | null;
  task_type: 'investigate' | 'analyze' | 'test' | 'document' | null;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  assigned_to: string | null;
  assigned_to_name?: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnownError {
  id: string;
  problem_id: string;
  title: string;
  symptoms: string;
  workaround: string;
  permanent_fix_eta: string | null;
  tags: string[];
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
