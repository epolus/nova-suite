/* SPDX-License-Identifier: AGPL-3.0-only */
export interface User {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  time_format: '12h' | '24h';
  date_format: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  roles: string[];
}

export interface UserListItem {
  id: string;
  email: string;
  display_name: string;
  user_id: string | null;
  phone?: string | null;
  mobile?: string | null;
  roles: string[];
}

export interface AdminUser {
  id: string;
  user_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  title: string | null;
  phone: string | null;
  mobile: string | null;
  location: string | null;
  timezone: string;
  time_format: '12h' | '24h';
  date_format: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  employee_type: string;
  company: string | null;
  company_name: string | null;
  preferred_language: string;
  start_date: string | null;
  last_working_date: string | null;
  is_active: boolean;
  manager_id: string | null;
  department_id: string | null;
  cost_center_id: string | null;
  created_at: string;
  updated_at: string;
  manager_name: string | null;
  department_name: string | null;
  cost_center_name: string | null;
  cost_center_code: string | null;
  roles: string[];
  role_details: { id: string; name: string }[];
  inherited_roles: string[];
}

export interface RoleItem {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DepartmentItem {
  id: string;
  name: string;
  description: string | null;
  parent_department_id: string | null;
  parent_department_name: string | null;
  cost_center_id: string | null;
  cost_center_name: string | null;
  cost_center_code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_count: number;
}

export interface CostCenterItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_count: number;
}

export interface CompanyItem {
  id: string;
  name: string;
  code: string | null;
  website: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  parent_company_id: string | null;
  parent_company_name: string | null;
  contact_user_id: string | null;
  contact_user_name: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  location_count: number;
}

export interface LocationItem {
  id: string;
  name: string;
  code: string;
  source: string;
  country: string | null;
  state: string | null;
  city: string | null;
  zip: string | null;
  street: string | null;
  parent_location_id: string | null;
  parent_location_name: string | null;
  company_id: string | null;
  company_name: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  display_name: string;
  title?: string;
  phone?: string;
  mobile?: string;
  location?: string;
  timezone?: string;
  time_format?: '12h' | '24h';
  date_format?: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  employee_type?: string;
  company?: string;
  preferred_language?: string;
  start_date?: string;
  last_working_date?: string;
  user_id?: string;
  manager_id?: string | null;
  department_id?: string | null;
  cost_center_id?: string | null;
  role_ids?: string[];
}

export interface ProcessItem {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  group_count: number;
}

export interface ServiceAdminItem {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssignmentGroupItem {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  manager_id: string | null;
  cost_center_id: string | null;
  parent_group_id: string | null;
  created_at: string;
  updated_at: string;
  manager_name: string | null;
  cost_center_name: string | null;
  cost_center_code: string | null;
  parent_group_name: string | null;
  member_count: number;
  members: { id: string; display_name: string }[];
  processes: { id: string; name: string }[];
  roles: { id: string; name: string }[];
}

export interface CreateAssignmentGroupPayload {
  name: string;
  description?: string;
  manager_id?: string | null;
  cost_center_id?: string | null;
  parent_group_id?: string | null;
  member_ids?: string[];
  process_ids?: string[];
  role_ids?: string[];
}

export interface UpdateAssignmentGroupPayload {
  name?: string;
  description?: string;
  manager_id?: string | null;
  cost_center_id?: string | null;
  parent_group_id?: string | null;
  is_active?: boolean;
  member_ids?: string[];
  process_ids?: string[];
  role_ids?: string[];
}

export interface UpdateUserPayload {
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string;
  title?: string | null;
  phone?: string | null;
  mobile?: string | null;
  location?: string | null;
  timezone?: string;
  time_format?: '12h' | '24h';
  date_format?: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  employee_type?: string;
  company?: string | null;
  preferred_language?: string;
  start_date?: string | null;
  last_working_date?: string | null;
  email?: string;
  user_id?: string | null;
  password?: string;
  manager_id?: string | null;
  department_id?: string | null;
  cost_center_id?: string | null;
  is_active?: boolean;
  role_ids?: string[];
}
