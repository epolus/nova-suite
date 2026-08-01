/* SPDX-License-Identifier: AGPL-3.0-only */
import type { SlaDefinition } from '../../../api/client';

export const PROCESS_COLORS: Record<string, string> = {
  incident: 'bg-red-100 text-red-700',
  request: 'bg-blue-100 text-blue-700',
  task: 'bg-purple-100 text-purple-700',
};

export const WARNING_ACTION_KEYS: Record<string, string> = {
  notify_assignee: 'notifyAssignee',
  notify_group_manager: 'notifyGroupManager',
  auto_assign: 'autoAssign',
};

export const BREACH_ACTION_KEYS: Record<string, string> = {
  escalate_priority: 'escalatePriority',
  notify_assignee: 'notifyAssignee',
  notify_group_manager: 'notifyGroupManager',
  reassign: 'reassign',
  notify_requester: 'notifyRequester',
};

export const EMPTY_FORM: Partial<SlaDefinition> = {
  name: '',
  description: '',
  process_type: 'incident',
  condition_priority: null,
  condition_impact: null,
  condition_urgency: null,
  condition_category: null,
  condition_service_id: null,
  resolution_hours: 24,
  response_hours: null,
  auto_close_days: 7,
  warning_pct: 80,
  on_warning: [],
  on_breach: [],
  sort_order: 100,
};
