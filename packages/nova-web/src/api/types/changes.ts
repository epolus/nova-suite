/* SPDX-License-Identifier: AGPL-3.0-only */
export interface ChangeStats {
  open_total: number;
  pending_approval: number;
}

export interface ChangeType {
  id: string;
  name: string;
  description: string | null;
  requires_cab_approval: boolean;
  requires_manager_approval: boolean;
  auto_approve: boolean;
  default_risk_level: 'low' | 'medium' | 'high' | 'very_high';
  max_implementation_hours: number | null;
  approval_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChangeAffectedCI {
  ci_id: string;
  display_name?: string;
  name?: string;
}

export interface ChangeApproval {
  id: string;
  change_id: string;
  approval_type: 'manager' | 'cab' | 'technical' | 'security' | 'business';
  status: 'pending' | 'approved' | 'rejected' | 'waived';
  approver_user_id: string | null;
  approver_group_id: string | null;
  approver_name?: string;
  approver_group_name?: string;
  decided_by: string | null;
  decision_notes: string | null;
  due_at: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChangeConflict {
  id: string;
  change_id: string;
  conflicting_change_id: string | null;
  conflict_type: 'schedule_overlap' | 'ci_overlap' | 'blackout_window';
  severity: 'warning' | 'blocking';
  details: string | null;
  created_at: string;
  conflicting_change_number?: string;
  conflicting_change_title?: string;
}

export interface Change {
  id: string;
  number: string;
  change_type_id: string;
  standard_change_id: string | null;
  category: string | null;
  title: string;
  description: string;
  reason_for_change: string;
  stage: 'request' | 'assessment' | 'approval' | 'planning' | 'implementation' | 'review';
  status: 'draft' | 'assessment' | 'pending_approval' | 'approved' | 'rejected' | 'planning' | 'scheduled' | 'implementing' | 'implemented' | 'reviewing' | 'closed' | 'cancelled';
  risk_level: 'low' | 'medium' | 'high' | 'very_high';
  impact: string;
  impact_description: string | null;
  implementation_plan: string;
  backout_plan: string;
  test_plan: string | null;
  requested_by: string;
  assigned_to: string | null;
  assignment_group_id: string | null;
  service_id: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  downtime_required: boolean;
  maintenance_window: string | null;
  implementation_notes: string | null;
  success: boolean | null;
  actual_downtime_minutes: number | null;
  related_problem_id: string | null;
  related_incident_id: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  business_justification: string | null;
  estimated_cost: number | null;
  review_notes: string | null;
  sla_due_at?: string | null;
  sla_breached?: boolean;
  created_at: string;
  updated_at: string;
  change_type_name?: string;
  assignment_group_name?: string;
  service_name?: string;
  assigned_to_name?: string;
  requested_by_name?: string;
  conflict_count?: number;
  pending_approvals?: number;
}

export interface ChangeDetail extends Change {
  affected_cis: ChangeAffectedCI[];
  approvals: ChangeApproval[];
  conflicts: ChangeConflict[];
  allowed_actions?: Array<
    | 'submit_assessment'
    | 'request_approval'
    | 'approve'
    | 'reject'
    | 'start_planning'
    | 'schedule'
    | 'start_implementation'
    | 'mark_implemented'
    | 'start_review'
    | 'close'
    | 'cancel'
  >;
}

export interface StandardChangeTemplate {
  id: string;
  change_type_id: string;
  change_type_name?: string;
  name: string;
  description: string | null;
  category: string | null;
  implementation_plan_template: string | null;
  backout_plan_template: string | null;
  test_plan_template: string | null;
  pre_assessed_risk: 'low' | 'medium' | 'high' | 'very_high';
  automated: boolean;
  automation_script: string | null;
  usage_count: number;
  success_rate: number | null;
  is_active: boolean;
}

export interface CabMeeting {
  id: string;
  title: string;
  scheduled_at: string;
  duration_min: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  minutes: string | null;
  created_by: string | null;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface ChangeBlackout {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ServiceListItem {
  id: string;
  name: string;
  description: string | null;
}
