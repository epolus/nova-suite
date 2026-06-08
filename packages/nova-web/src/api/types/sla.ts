/* SPDX-License-Identifier: AGPL-3.0-only */
export interface SlaDefinition {
  id: string;
  name: string;
  description: string | null;
  process_type: 'incident' | 'request' | 'task' | 'problem' | 'change';
  condition_priority: number | null;
  condition_impact: string | null;
  condition_urgency: string | null;
  condition_category: string | null;
  condition_service_id: string | null;
  condition_service_name?: string;
  resolution_hours: number;
  response_hours: number | null;
  auto_close_days: number;
  warning_pct: number;
  on_warning: string[];
  on_breach: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
