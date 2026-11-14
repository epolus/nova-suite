/* SPDX-License-Identifier: AGPL-3.0-only */
export type CustomFieldEntityType = 'incident' | 'change' | 'asset';

export type CustomFieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'number'
  | 'email'
  | 'checkbox'
  | 'select'
  | 'multiselect'
  | 'cmdb_ref'
  | 'user_ref'
  | 'location_ref';

export type CustomFieldRequiredOn = '' | 'create' | 'resolve';

export interface CustomFieldOption {
  id?: string;
  value: string;
  label: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface CustomFieldDefinition {
  id: string;
  entity_type: CustomFieldEntityType;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  config: Record<string, unknown>;
  required_on: CustomFieldRequiredOn;
  sort_order: number;
  is_active: boolean;
  options?: CustomFieldOption[];
  created_at?: string;
  updated_at?: string;
}
