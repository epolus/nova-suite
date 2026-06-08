/* SPDX-License-Identifier: AGPL-3.0-only */
export interface CIClass {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  parent_class: string | null;
  attributes: Record<string, { type: string; reference_table?: string }>;
  icon: string;
  created_at: string;
  updated_at: string;
}

export interface CI {
  id: string;
  class_id: string;
  name: string;
  display_name: string;
  status: string;
  environment: string;
  attributes: Record<string, unknown>;
  managed_by: string | null;
  assigned_to: string | null;
  supported_by: string | null;
  location_id: string | null;
  location: string | null;
  location_name?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  class_display_name?: string;
  class_name?: string;
  class_icon?: string;
  class_attributes?: Record<string, { type: string }>;
  managed_by_name?: string;
  assigned_to_name?: string;
  supported_by_name?: string;
}

export interface CIRelationship {
  id: string;
  source_ci_id: string;
  target_ci_id: string;
  relationship_type: string;
  notes: string | null;
  source_name?: string;
  source_display_name?: string;
  target_name?: string;
  target_display_name?: string;
}

export interface CIHistoryEntry {
  id: string;
  ci_id: string;
  changed_by: string;
  change_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  changed_by_name?: string;
}

export interface ImpactedCI {
  ci_id: string;
  ci_name: string;
  relationship_type: string;
  depth: number;
}
