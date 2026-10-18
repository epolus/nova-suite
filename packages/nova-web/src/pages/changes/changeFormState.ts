/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Change, ChangeDetail } from '@/api/client';

export type ChangeFormState = {
  change_type_id: string;
  standard_change_id: string;
  category: string;
  title: string;
  description: string;
  reason_for_change: string;
  risk_level: Change['risk_level'];
  impact: string;
  impact_description: string;
  implementation_plan: string;
  backout_plan: string;
  test_plan: string;
  assigned_to: string;
  assignment_group_id: string;
  service_id: string;
  scheduled_start: string;
  scheduled_end: string;
  maintenance_window: string;
  downtime_required: boolean;
  related_problem_id: string;
  related_incident_id: string;
  priority: Change['priority'];
  business_justification: string;
  estimated_cost: string;
  review_notes: string;
  success: '' | 'true' | 'false';
  failure_category: string;
  planned_downtime_minutes: string;
  actual_downtime_minutes: string;
  affected_cis: string[];
};

export const EMPTY_CHANGE_FORM: ChangeFormState = {
  change_type_id: '',
  standard_change_id: '',
  category: '',
  title: '',
  description: '',
  reason_for_change: '',
  risk_level: 'medium',
  impact: 'medium',
  impact_description: '',
  implementation_plan: '',
  backout_plan: '',
  test_plan: '',
  assigned_to: '',
  assignment_group_id: '',
  service_id: '',
  scheduled_start: '',
  scheduled_end: '',
  maintenance_window: '',
  downtime_required: false,
  related_problem_id: '',
  related_incident_id: '',
  priority: 'medium',
  business_justification: '',
  estimated_cost: '',
  review_notes: '',
  success: '',
  failure_category: '',
  planned_downtime_minutes: '',
  actual_downtime_minutes: '',
  affected_cis: [],
};

export function formFromDetail(detail: ChangeDetail): ChangeFormState {
  return {
    change_type_id: detail.change_type_id,
    standard_change_id: detail.standard_change_id || '',
    category: detail.category || '',
    title: detail.title,
    description: detail.description,
    reason_for_change: detail.reason_for_change,
    risk_level: detail.risk_level,
    impact: detail.impact,
    impact_description: detail.impact_description || '',
    implementation_plan: detail.implementation_plan,
    backout_plan: detail.backout_plan,
    test_plan: detail.test_plan || '',
    assigned_to: detail.assigned_to || '',
    assignment_group_id: detail.assignment_group_id || '',
    service_id: detail.service_id || '',
    scheduled_start: detail.scheduled_start ? detail.scheduled_start.slice(0, 16) : '',
    scheduled_end: detail.scheduled_end ? detail.scheduled_end.slice(0, 16) : '',
    maintenance_window: detail.maintenance_window || '',
    downtime_required: detail.downtime_required,
    related_problem_id: detail.related_problem_id || '',
    related_incident_id: detail.related_incident_id || '',
    priority: detail.priority,
    business_justification: detail.business_justification || '',
    estimated_cost: detail.estimated_cost != null ? String(detail.estimated_cost) : '',
    review_notes: detail.review_notes || '',
    success: detail.success === true ? 'true' : detail.success === false ? 'false' : '',
    failure_category: detail.failure_category || '',
    planned_downtime_minutes: detail.planned_downtime_minutes != null ? String(detail.planned_downtime_minutes) : '',
    actual_downtime_minutes: detail.actual_downtime_minutes != null ? String(detail.actual_downtime_minutes) : '',
    affected_cis: (detail.affected_cis || []).map((x) => x.ci_id),
  };
}
