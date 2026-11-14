/* SPDX-License-Identifier: AGPL-3.0-only */

export type ChecklistEntityType = 'incident' | 'change';

export type ChecklistTemplateItem = {
  id: string;
  label: string;
  sort_order: number;
  required: boolean;
};

export type ChecklistTemplate = {
  id: string;
  name: string;
  entity_type: ChecklistEntityType;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  items: ChecklistTemplateItem[];
};

export type ChecklistInstanceItem = {
  id: string;
  label: string;
  sort_order: number;
  required: boolean;
  is_done: boolean;
  done_by: string | null;
  done_by_name: string | null;
  done_at: string | null;
};

export type ChecklistInstance = {
  id: string;
  entity_type: ChecklistEntityType;
  entity_id: string;
  template_id: string | null;
  template_name: string;
  created_at: string;
  items: ChecklistInstanceItem[];
  open_required_count: number;
};

export type ChecklistTemplatePayload = {
  name: string;
  entity_type: ChecklistEntityType;
  description?: string | null;
  is_active?: boolean;
  items: Array<{ label: string; sort_order?: number; required?: boolean }>;
};
