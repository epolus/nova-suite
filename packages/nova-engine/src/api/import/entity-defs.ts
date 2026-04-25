/* SPDX-License-Identifier: AGPL-3.0-only */
export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  type?: 'string' | 'integer' | 'number' | 'boolean' | 'date' | 'enum';
  enumValues?: string[];
  /** FK resolution: look up this table by the given column to resolve to an id */
  resolve?: { table: string; matchColumn: string; idColumn?: string };
  /** Unique within tenant scope */
  unique?: { table: string; column: string };
  aliases?: string[];
}

export interface EntityDef {
  key: string;
  label: string;
  fields: FieldDef[];
}

export const ENTITY_DEFS: Record<string, EntityDef> = {
  departments: {
    key: 'departments',
    label: 'Departments',
    fields: [
      { key: 'name', label: 'Name', required: true, unique: { table: 'departments', column: 'name' }, aliases: ['department', 'dept_name'] },
      { key: 'description', label: 'Description', aliases: ['desc'] },
      { key: 'is_active', label: 'Active', type: 'boolean', aliases: ['active', 'enabled'] },
    ],
  },

  cost_centers: {
    key: 'cost_centers',
    label: 'Cost Centers',
    fields: [
      { key: 'code', label: 'Code', required: true, unique: { table: 'cost_centers', column: 'code' }, aliases: ['cost_center_code', 'cc_code'] },
      { key: 'name', label: 'Name', required: true, aliases: ['cost_center', 'cc_name'] },
      { key: 'description', label: 'Description', aliases: ['desc'] },
      { key: 'is_active', label: 'Active', type: 'boolean', aliases: ['active'] },
    ],
  },

  users: {
    key: 'users',
    label: 'Users',
    fields: [
      { key: 'email', label: 'Email', required: true, unique: { table: 'users', column: 'email' }, aliases: ['e-mail', 'mail', 'email_address'] },
      { key: 'password', label: 'Password', aliases: ['pass', 'pwd'] },
      { key: 'display_name', label: 'Display Name', aliases: ['name', 'full_name', 'fullname'] },
      { key: 'user_id', label: 'Employee ID', aliases: ['employee_id', 'emp_id', 'staff_id'] },
      { key: 'first_name', label: 'First Name', aliases: ['firstname', 'given_name'] },
      { key: 'last_name', label: 'Last Name', aliases: ['lastname', 'surname', 'family_name'] },
      { key: 'title', label: 'Job Title', aliases: ['job_title', 'position'] },
      { key: 'phone', label: 'Phone', aliases: ['phone_number', 'telephone'] },
      { key: 'mobile', label: 'Mobile', aliases: ['mobile_phone', 'cell', 'cell_phone'] },
      { key: 'location', label: 'Location', aliases: ['office', 'site'] },
      { key: 'timezone', label: 'Timezone', aliases: ['tz', 'time_zone'] },
      { key: 'time_format', label: 'Time Format', type: 'enum', enumValues: ['12h', '24h'], aliases: ['hour_format', 'clock_format'] },
      { key: 'date_format', label: 'Date Format', type: 'enum', enumValues: ['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'], aliases: ['day_format'] },
      { key: 'employee_type', label: 'Employee Type', type: 'enum', enumValues: ['employee', 'contractor', 'vendor', 'intern'], aliases: ['type', 'emp_type'] },
      { key: 'company', label: 'Company (id/name/code)', aliases: ['organization', 'org'] },
      { key: 'preferred_language', label: 'Language', aliases: ['lang', 'language'] },
      { key: 'start_date', label: 'Start Date', type: 'date', aliases: ['hire_date', 'joining_date'] },
      { key: 'last_working_date', label: 'Last Working Date', type: 'date', aliases: ['end_date', 'termination_date', 'leaving_date'] },
      { key: 'manager', label: 'Manager (email)', resolve: { table: 'users', matchColumn: 'email' }, aliases: ['manager_email', 'reports_to'] },
      { key: 'department', label: 'Department (name)', resolve: { table: 'departments', matchColumn: 'name' }, aliases: ['dept', 'department_name'] },
      { key: 'cost_center', label: 'Cost Center (code)', resolve: { table: 'cost_centers', matchColumn: 'code' }, aliases: ['cc', 'cost_center_code'] },
      { key: 'is_active', label: 'Active', type: 'boolean', aliases: ['active', 'enabled'] },
      { key: 'roles', label: 'Roles (comma-separated)', aliases: ['role', 'user_roles'] },
    ],
  },

  assignment_groups: {
    key: 'assignment_groups',
    label: 'Assignment Groups',
    fields: [
      { key: 'name', label: 'Name', required: true, unique: { table: 'assignment_groups', column: 'name' }, aliases: ['group_name', 'group'] },
      { key: 'description', label: 'Description', aliases: ['desc'] },
      { key: 'manager', label: 'Manager (email)', resolve: { table: 'users', matchColumn: 'email' }, aliases: ['manager_email'] },
      { key: 'cost_center', label: 'Cost Center (code)', resolve: { table: 'cost_centers', matchColumn: 'code' }, aliases: ['cc'] },
      { key: 'parent_group', label: 'Parent Group (name)', resolve: { table: 'assignment_groups', matchColumn: 'name' }, aliases: ['parent'] },
      { key: 'is_active', label: 'Active', type: 'boolean', aliases: ['active'] },
      { key: 'members', label: 'Members (comma-separated emails)', aliases: ['member_emails'] },
    ],
  },

  cmdb: {
    key: 'cmdb',
    label: 'CMDB / Configuration Items',
    fields: [
      { key: 'name', label: 'Name', required: true, aliases: ['ci_name', 'item_name', 'hostname'] },
      { key: 'class', label: 'CI Class (name)', required: true, resolve: { table: 'ci_classes', matchColumn: 'name' }, aliases: ['ci_class', 'class_name', 'type'] },
      { key: 'display_name', label: 'Display Name', aliases: ['label'] },
      { key: 'status', label: 'Status', type: 'enum', enumValues: ['active', 'maintenance', 'retired', 'planned'], aliases: ['ci_status'] },
      { key: 'environment', label: 'Environment', type: 'enum', enumValues: ['production', 'staging', 'development', 'test'], aliases: ['env'] },
      { key: 'managed_by', label: 'Managed By (email)', resolve: { table: 'users', matchColumn: 'email' }, aliases: ['owner', 'manager'] },
      { key: 'location', label: 'Location', aliases: ['site'] },
      { key: 'notes', label: 'Notes', aliases: ['description', 'comments'] },
    ],
  },

  incidents: {
    key: 'incidents',
    label: 'Incidents',
    fields: [
      { key: 'title', label: 'Title', required: true, aliases: ['subject', 'summary', 'short_description'] },
      { key: 'description', label: 'Description', aliases: ['desc', 'long_description', 'details'] },
      { key: 'status', label: 'Status', type: 'enum', enumValues: ['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed', 'cancelled'] },
      { key: 'impact', label: 'Impact', type: 'enum', enumValues: ['low', 'medium', 'high'] },
      { key: 'urgency', label: 'Urgency', type: 'enum', enumValues: ['low', 'medium', 'high'] },
      { key: 'priority', label: 'Priority', type: 'integer', aliases: ['prio'] },
      { key: 'assigned_to', label: 'Assigned To (email)', resolve: { table: 'users', matchColumn: 'email' }, aliases: ['assignee', 'assigned_to_email'] },
      { key: 'assignment_group', label: 'Assignment Group (name)', resolve: { table: 'assignment_groups', matchColumn: 'name' }, aliases: ['group', 'support_group'] },
      { key: 'caller', label: 'Caller (email)', resolve: { table: 'users', matchColumn: 'email' }, aliases: ['caller_email', 'reported_by'] },
      { key: 'contact_info', label: 'Contact Info', aliases: ['contact'] },
      { key: 'category', label: 'Category', aliases: ['cat'] },
      { key: 'subcategory', label: 'Subcategory', aliases: ['subcat', 'sub_category'] },
      { key: 'configuration_item', label: 'CI (name)', resolve: { table: 'configuration_items', matchColumn: 'name' }, aliases: ['ci', 'ci_name'] },
    ],
  },
};

/** Build a suggested column mapping from file columns to entity fields */
export function suggestMapping(
  fileColumns: string[],
  entityType: string,
  fieldsOverride?: FieldDef[],
): Record<string, string> {
  const def = ENTITY_DEFS[entityType];
  if (!def && !fieldsOverride) return {};
  const fields = fieldsOverride || def!.fields;

  const mapping: Record<string, string> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_.]+/g, '_').trim();

  for (const col of fileColumns) {
    const norm = normalize(col);
    for (const field of fields) {
      if (norm === normalize(field.key) || norm === normalize(field.label)) {
        mapping[col] = field.key;
        break;
      }
      if (field.aliases?.some((a) => normalize(a) === norm)) {
        mapping[col] = field.key;
        break;
      }
    }
  }
  return mapping;
}
