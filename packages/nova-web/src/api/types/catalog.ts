/* SPDX-License-Identifier: AGPL-3.0-only */
export interface Category {
  id: string;
  external_key?: string | null;
  name: string;
  description: string | null;
  icon: string;
  sort_order: number;
  is_active: boolean;
  item_count?: number;
}

export interface FormField {
  name: string;
  label?: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'email' | 'checkbox' | 'select' | 'multiselect' | 'cmdb_ref' | 'user_ref' | 'location_ref';
  required?: boolean;
  options?: string[];
  placeholder?: string;
  helpText?: string;
  min?: number;
  max?: number;
  pattern?: string;
  ci_class?: string;
  ci_filter?: Record<string, string>;
  defaultValue?: string;
}

export interface ServiceItem {
  id: string;
  external_key?: string | null;
  category_id: string;
  name: string;
  short_description: string | null;
  description: string | null;
  icon: string;
  picture_storage_key: string | null;
  price: number | null;
  custom_attributes: Record<string, unknown>;
  form_schema: { fields: FormField[] };
  approval_required: boolean;
  sla_hours: number;
  fulfillment_model_id?: string | null;
  is_active: boolean;
  category_name?: string;
  task_count?: number;
}

export interface ServiceRequest {
  id: string;
  number: string;
  requester_id: string;
  requested_for: string | null;
  service_item_id: string;
  form_data: Record<string, unknown>;
  form_schema?: { fields: FormField[] };
  delivery_info: { location?: string; date_needed?: string; instructions?: string };
  batch_id: string | null;
  status: string;
  priority: string;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  provisioned_ci_id?: string | null;
  provisioned_ci_name?: string | null;
  provisioned_asset_id?: string | null;
  provisioned_asset_name?: string | null;
  provisioned_asset_tag?: string | null;
  created_at: string;
  updated_at: string;
  service_item_name?: string;
  requester_name?: string;
  approved_by_name?: string;
  requested_for_name?: string;
  batch_count?: number;
}

export interface FulfillmentModelTask {
  name: string;
  instructions?: string | null;
  assigned_group_id?: string | null;
  sla_hours?: number | null;
}

export interface FulfillmentModelConfig {
  tasks: FulfillmentModelTask[];
  ci: {
    enabled: boolean;
    class_id?: string | null;
    name_template: string;
    display_name_template: string;
    status: 'installed' | 'in_stock' | 'maintenance' | 'retired' | 'planned';
  };
  asset: {
    enabled: boolean;
    category: string;
    name_template: string;
    asset_tag_template: string;
  };
}

export function fulfillmentGroupTasks(config: FulfillmentModelConfig | null | undefined): FulfillmentModelTask[] {
  return config?.tasks ?? [];
}

export interface FulfillmentModel {
  id: string;
  name: string;
  description: string | null;
  config: FulfillmentModelConfig;
  is_active: boolean;
  task_group_names?: Array<string | null> | null;
  ci_class_name?: string | null;
  item_count?: number;
}

export interface CatalogTask {
  id: string;
  external_key?: string | null;
  service_item_id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  task_type: 'approval' | 'manual' | 'automated';
  task_order: number;
  assigned_group_id: string | null;
  assigned_group_name?: string;
  sla_hours: number | null;
  /** When task_type is automated, worker executes rest_call / cmdb_lookup without user signals. */
  automation_config?: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
}

export interface AllCatalogTask extends CatalogTask {
  service_item_name: string;
  category_name: string;
  service_item_is_active?: boolean;
}

export type CartPriority = 'low' | 'medium' | 'high' | 'critical';

export interface CartItem {
  id: string;
  serviceItem: ServiceItem;
  formData: Record<string, unknown>;
  priority: CartPriority;
  notes: string;
}

export interface CartState {
  items: CartItem[];
  cartCount: number;
  cartTotal: number;
}
