/* SPDX-License-Identifier: AGPL-3.0-only */
export interface RequestTask {
  id: string;
  number: string;
  request_id: string;
  catalog_task_id: string | null;
  task_order: number;
  name: string;
  description: string | null;
  instructions: string | null;
  task_type: 'approval' | 'manual' | 'automated';
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'rejected' | 'failed';
  assigned_to: string | null;
  assigned_to_name?: string;
  assigned_group_id: string | null;
  assigned_group_name?: string;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_name?: string;
  outcome: 'approved' | 'rejected' | null;
  notes: string | null;
  created_at: string;
  /** From parent request when tasks are loaded with the request (e.g. GET /requests/:id/tasks). */
  requester_id?: string;
  requested_for?: string | null;
}

export interface RequestTaskListItem extends RequestTask {
  request_number: string;
  request_status: string;
  service_item_name: string;
  requester_id: string;
  /** Employee the request is for; when set, manager approval uses this user (not submitter). */
  requested_for?: string | null;
  requester_name: string;
}
