/* SPDX-License-Identifier: AGPL-3.0-only */

export interface AlertListItem {
  id: string;
  number: string;
  source: string;
  status: 'firing' | 'resolved';
  severity: string;
  title: string;
  event_count: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  source_url: string | null;
  suppressed_reason: string | null;
  incident_id: string | null;
  incident_number: string | null;
  ci_name: string | null;
}

export interface AlertDetail extends AlertListItem {
  fingerprint: string;
  labels: Record<string, string>;
  configuration_item_id: string | null;
  definition_name: string | null;
}

export interface AlertEvent {
  id: string;
  status: 'firing' | 'resolved';
  severity: string;
  title: string;
  occurred_at: string | null;
  received_at: string;
  source_url: string | null;
}

export interface AlertDefinition {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  source: string | null;
  severity: string | null;
  match_labels: Record<string, string>;
  severity_map: Record<string, string> | null;
  action: 'none' | 'incident' | 'workflow';
  assignment_group_id: string | null;
  impact: string | null;
  urgency: string | null;
  workflow_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface CorrelationHint {
  source: string;
  summary: string;
  confidence: number;
  relatedEntityType?: string;
  relatedEntityId?: string;
  occurredAt?: string;
}
