/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Zod Validation Schemas ───
// Central definition of all request/response shapes.

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

// ─── Common ───
export const uuidSchema = z.guid();
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).passthrough();

export const rankedSuggestionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
}).passthrough();

const e164PhoneSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    // Normalize common user formatting before E.164 validation.
    return value.trim().replace(/[()\-\s]/g, '');
  },
  z.string().regex(/^\+[1-9]\d{1,14}$/, 'Must be a valid E.164 phone number'),
);

// ─── Auth ───
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  first_name: z.string().max(255).optional(),
  last_name: z.string().max(255).optional(),
  display_name: z.string().min(1).max(255),
  title: z.string().max(255).optional(),
  phone: e164PhoneSchema.optional(),
  mobile: e164PhoneSchema.optional(),
  location: z.string().max(255).default('Zurich'),
  timezone: z.string().max(100).default('UTC'),
  time_format: z.enum(['12h', '24h']).default('24h'),
  date_format: z.enum(['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).default('YYYY-MM-DD'),
  employee_type: z.enum(['employee', 'contractor', 'vendor', 'intern']).default('employee'),
  company: uuidSchema.optional(),
  preferred_language: z.string().max(10).default('en'),
  start_date: z.string().optional(),
  last_working_date: z.string().optional(),
  user_id: z.string().max(100).optional(),
  manager_id: uuidSchema.optional(),
  department_id: uuidSchema.optional(),
  cost_center_id: uuidSchema.optional(),
  role_ids: z.array(uuidSchema).min(1).default([]),
});

// ─── Service Catalog ───
export const createCategorySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  icon: z.string().max(50).optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const createServiceItemSchema = z.object({
  category_id: uuidSchema,
  name: z.string().min(1).max(255),
  short_description: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  icon: z.string().max(50).optional(),
  price: z.number().min(0).optional().nullable(),
  custom_attributes: z.record(z.string(), z.unknown()).default({}),
  form_schema: z
    .object({ fields: z.array(z.record(z.string(), z.unknown())) })
    .default({ fields: [] }),
  approval_required: z.boolean().default(false),
  sla_hours: z.number().int().min(1).optional(),
});

export const updateServiceItemSchema = createServiceItemSchema.partial();

// ─── Configuration Packages ───
export const configExternalKeySchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9._/-]*$/, 'Must start with a lowercase letter or number and contain only lowercase letters, numbers, dot, underscore, slash, or dash');

const nullableStringSchema = z.string().nullable().optional();

export const configPackageCategorySchema = z.object({
  external_key: configExternalKeySchema,
  name: z.string().min(1).max(255),
  description: nullableStringSchema,
  icon: z.string().max(50).default('folder'),
  sort_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

export const configPackagePictureSchema = z.object({
  file_name: z.string().min(1).max(255),
  content_type: z.string().min(1).max(100),
  base64: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const configPackageCatalogTaskSchema = z.object({
  external_key: configExternalKeySchema,
  name: z.string().min(1).max(255),
  description: nullableStringSchema,
  instructions: nullableStringSchema,
  task_type: z.enum(['approval', 'manual', 'automated']).default('manual'),
  task_order: z.number().int().min(1).default(1),
  assigned_group_name: nullableStringSchema,
  sla_hours: z.number().int().min(1).nullable().optional(),
  automation_config: z.record(z.string(), z.unknown()).default({}),
  is_active: z.boolean().default(true),
});

export const configPackageServiceItemSchema = z.object({
  external_key: configExternalKeySchema,
  category_external_key: configExternalKeySchema,
  name: z.string().min(1).max(255),
  short_description: nullableStringSchema,
  description: nullableStringSchema,
  icon: z.string().max(50).default('box'),
  picture: configPackagePictureSchema.nullable().optional(),
  price: z.number().min(0).nullable().optional(),
  custom_attributes: z.record(z.string(), z.unknown()).default({}),
  form_schema: z.object({ fields: z.array(z.record(z.string(), z.unknown())) }).default({ fields: [] }),
  approval_required: z.boolean().default(false),
  sla_hours: z.number().int().min(1).default(72),
  is_active: z.boolean().default(true),
  tasks: z.array(configPackageCatalogTaskSchema).default([]),
});

export const configPackageNotificationRuleTemplateSchema = z.object({
  locale: z.string().regex(/^[a-z]{2}(?:-[a-z]{2})?$/),
  title_template: z.string().min(1),
  body_template: z.string().nullable().optional(),
  body_html_template: z.string().nullable().optional(),
});

export const configPackageNotificationRuleSchema = z.object({
  external_key: configExternalKeySchema,
  name: z.string().min(1).max(255),
  description: nullableStringSchema,
  entity_type: z.enum(['incident', 'request', 'change', 'problem', 'knowledge', 'major_incident']).default('incident'),
  trigger_key: z.string().min(1).max(100),
  recipient_type: z.string().min(1).max(100),
  recipient_user_email: z.string().email().nullable().optional(),
  recipient_group_name: z.string().min(1).max(255).nullable().optional(),
  channels: z.array(z.enum(['in_app', 'email'])).min(1).default(['in_app']),
  templates: z.array(configPackageNotificationRuleTemplateSchema).min(1),
  title_template: z.string().min(1).optional(),
  body_template: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(100),
});

export const configPackageBundleSchema = z.object({
  format: z.literal('nova.config-package'),
  version: z.literal(1),
  name: z.string().min(1).max(255).default('Nova configuration package'),
  schema_version: z.string().regex(/^v\d{2}\.\d{2}\.\d{2}$/),
  exported_at: z.string(),
  source: z.object({
    tenant_id: uuidSchema.optional(),
    instance: z.string().max(255).optional(),
  }).default({}),
  contents: z.object({
    catalog: z.object({
      categories: z.array(configPackageCategorySchema).default([]),
      service_items: z.array(configPackageServiceItemSchema).default([]),
    }).default({ categories: [], service_items: [] }),
    notifications: z.object({
      rules: z.array(configPackageNotificationRuleSchema).default([]),
    }).default({ rules: [] }),
  }).default({
    catalog: { categories: [], service_items: [] },
    notifications: { rules: [] },
  }),
});

export const configPackageApplySchema = z.object({
  package: configPackageBundleSchema,
});

// ─── Requests (User Portal) ───
export const createRequestSchema = z.object({
  service_item_id: uuidSchema,
  form_data: z.record(z.string(), z.unknown()).default({}),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  notes: z.string().max(5000).optional(),
  requested_for: uuidSchema.optional(),
  delivery_info: z.object({
    location: z.string().max(500).optional(),
    date_needed: z.string().optional(),
    instructions: z.string().max(2000).optional(),
  }).default({}),
  batch_id: uuidSchema.optional(),
});

export const batchRequestSchema = z.object({
  items: z.array(z.object({
    service_item_id: uuidSchema,
    form_data: z.record(z.string(), z.unknown()).default({}),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    notes: z.string().max(5000).optional(),
  })).min(1).max(50),
  requested_for: uuidSchema.optional(),
  delivery_info: z.object({
    location: z.string().max(500).optional(),
    date_needed: z.string().optional(),
    instructions: z.string().max(2000).optional(),
  }).default({}),
});

export const approveRequestSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().max(2000).optional(),
});

// ─── Incidents (Fulfiller) ───
export const createIncidentSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  impact: z.enum(['low', 'medium', 'high']).default('medium'),
  urgency: z.enum(['low', 'medium', 'high']).default('medium'),
  assigned_to: uuidSchema.optional(),
  assignment_group_id: uuidSchema.optional(),
  caller_id: uuidSchema.optional(),
  contact_info: z.string().max(1000).optional(),
  service_id: uuidSchema.optional(),
  configuration_item_id: uuidSchema.optional(),
  category: z.string().max(255).optional(),
  subcategory: z.string().max(255).optional(),
  request_id: uuidSchema.optional(),
});

export const updateIncidentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  status: z
    .enum(['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed', 'cancelled'])
    .optional(),
  impact: z.enum(['low', 'medium', 'high']).optional(),
  urgency: z.enum(['low', 'medium', 'high']).optional(),
  assigned_to: uuidSchema.nullable().optional(),
  assignment_group_id: uuidSchema.nullable().optional(),
  caller_id: uuidSchema.nullable().optional(),
  contact_info: z.string().max(1000).nullable().optional(),
  service_id: uuidSchema.nullable().optional(),
  configuration_item_id: uuidSchema.nullable().optional(),
  category: z.string().max(255).nullable().optional(),
  subcategory: z.string().max(255).nullable().optional(),
  resolution_code: z.string().max(255).nullable().optional(),
  resolution_notes: z.string().max(10000).nullable().optional(),
});

// ─── Problems ───
export const createProblemSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  impact: z.enum(['low', 'medium', 'high']).default('medium'),
  category: z.string().max(100).optional(),
  status: z.enum([
    'new',
    'investigating',
    'root_cause_identified',
    'fix_in_progress',
    'resolved',
    'closed',
    'known_error',
  ]).optional(),
  root_cause: z.string().max(10000).optional(),
  symptoms: z.string().max(10000).optional(),
  workaround: z.string().max(10000).optional(),
  permanent_fix: z.string().max(10000).optional(),
  reported_by: uuidSchema.optional(),
  assigned_to: uuidSchema.nullable().optional(),
  assignment_group_id: uuidSchema,
  affected_ci: uuidSchema.nullable().optional(),
  resolution_notes: z.string().max(10000).optional(),
});

export const updateProblemSchema = createProblemSchema.partial();

// ─── Changes ───
export const createChangeSchema = z.object({
  change_type_id: uuidSchema,
  standard_change_id: uuidSchema.nullable().optional(),
  category: z.string().max(100).optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  reason_for_change: z.string().max(10000).optional(),
  stage: z.enum(['request', 'assessment', 'approval', 'planning', 'implementation', 'review']).optional(),
  status: z.enum([
    'draft',
    'assessment',
    'pending_approval',
    'approved',
    'rejected',
    'planning',
    'scheduled',
    'implementing',
    'implemented',
    'reviewing',
    'closed',
    'cancelled',
  ]).optional(),
  risk_level: z.enum(['low', 'medium', 'high', 'very_high']).default('medium'),
  impact: z.string().max(20).default('medium'),
  impact_description: z.string().max(10000).optional(),
  implementation_plan: z.string().max(20000).optional(),
  backout_plan: z.string().max(20000).optional(),
  test_plan: z.string().max(20000).optional(),
  requested_by: uuidSchema.optional(),
  assigned_to: uuidSchema.nullable().optional(),
  assignment_group_id: uuidSchema,
  service_id: uuidSchema.nullable().optional(),
  affected_cis: z.array(uuidSchema).default([]),
  scheduled_start: z.string().nullable().optional(),
  scheduled_end: z.string().nullable().optional(),
  actual_start: z.string().nullable().optional(),
  actual_end: z.string().nullable().optional(),
  downtime_required: z.boolean().optional(),
  maintenance_window: z.string().max(100).optional(),
  implementation_notes: z.string().max(10000).optional(),
  success: z.boolean().nullable().optional(),
  actual_downtime_minutes: z.number().int().min(0).nullable().optional(),
  related_problem_id: uuidSchema.nullable().optional(),
  related_incident_id: uuidSchema.nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  business_justification: z.string().max(10000).optional(),
  estimated_cost: z.number().nonnegative().nullable().optional(),
  review_notes: z.string().max(10000).optional(),
});

export const updateChangeSchema = createChangeSchema.partial();

export const changeTransitionSchema = z.object({
  action: z.enum(['submit_assessment', 'request_approval', 'approve', 'reject', 'start_planning', 'schedule', 'start_implementation', 'mark_implemented', 'start_review', 'close', 'cancel']),
  notes: z.string().max(5000).optional(),
  scheduled_start: z.string().nullable().optional(),
  scheduled_end: z.string().nullable().optional(),
});

export const changeApprovalDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'waived']),
  notes: z.string().max(5000).optional(),
});

export const createChangeTypeSchema = z.object({
  name: z.enum(['standard', 'normal', 'emergency']).or(z.string().min(1).max(100)),
  description: z.string().max(2000).optional(),
  requires_cab_approval: z.boolean().optional(),
  requires_manager_approval: z.boolean().optional(),
  auto_approve: z.boolean().optional(),
  default_risk_level: z.enum(['low', 'medium', 'high', 'very_high']).optional(),
  max_implementation_hours: z.number().int().positive().optional(),
  approval_config: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional(),
});

export const updateChangeTypeSchema = createChangeTypeSchema.partial();

export const adminCreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  display_name: z.string().min(1).max(255),
  phone: e164PhoneSchema.optional().nullable(),
  mobile: e164PhoneSchema.optional().nullable(),
}).passthrough();

export const adminUpdateUserSchema = z.object({
  phone: e164PhoneSchema.optional().nullable(),
  mobile: e164PhoneSchema.optional().nullable(),
}).passthrough();

export const createCabMeetingSchema = z.object({
  title: z.string().min(1).max(255),
  scheduled_at: z.string(),
  duration_min: z.number().int().min(15).max(480).default(60),
  minutes: z.string().max(20000).optional(),
});

export const majorIncidentResolveSchema = z.object({
  solution: z.string().min(1).max(20000),
});

export const createBlackoutSchema = z.object({
  name: z.string().min(1).max(255),
  start_date: z.string(),
  end_date: z.string(),
  reason: z.string().max(2000).optional(),
});

export const updateBlackoutSchema = createBlackoutSchema.partial();

export const incidentLinkMajorIncidentSchema = z.object({
  major_incident_id: uuidSchema,
});

export const addJournalEntrySchema = z.object({
  entry_type: z.enum(['comment', 'work_note', 'state_change', 'assignment']).default('comment'),
  content: z.string().min(1).max(10000),
  is_customer_visible: z.boolean().default(true),
});

// ─── CMDB ───
export const createCIClassSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z_]+$/, 'Must be lowercase with underscores only'),
  display_name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  parent_class: uuidSchema.optional(),
  attributes: z.record(z.string(), z.unknown()).default({}),
  icon: z.string().max(50).optional(),
  is_active: z.boolean().optional().default(true),
});

export const createCISchema = z.object({
  class_id: uuidSchema,
  name: z.string().min(1).max(255),
  display_name: z.string().max(255).optional().nullable(),
  status: z.enum(['active', 'maintenance', 'retired', 'planned']).default('active'),
  environment: z.enum(['production', 'staging', 'development', 'test']).default('production'),
  attributes: z.record(z.string(), z.unknown()).default({}),
  managed_by: uuidSchema.optional().nullable(),
  assigned_to: uuidSchema.optional().nullable(),
  supported_by: uuidSchema.optional().nullable(),
  location_id: uuidSchema.optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const updateCISchema = createCISchema.partial();

export const createCIRelationshipSchema = z.object({
  source_ci_id: uuidSchema,
  target_ci_id: uuidSchema,
  relationship_type: z.enum([
    'depends_on',
    'used_by',
    'runs_on',
    'connected_to',
    'part_of',
    'manages',
  ]),
  notes: z.string().max(2000).optional(),
});

// ─── Major incidents ───
export const postmortemActionItemSchema = z.object({
  title: z.string().min(1).max(500),
  owner_user_id: uuidSchema.optional().nullable(),
  due_at: z.string().optional().nullable(),
});

export const createMajorIncidentSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  priority: z.union([z.literal(1), z.literal(2)]).default(1),
  impact: z.enum(['low', 'medium', 'high']).default('high'),
  urgency: z.enum(['low', 'medium', 'high']).default('high'),
  affected_service_ids: z.array(uuidSchema).default([]),
  assigned_team_id: uuidSchema.optional().nullable(),
  primary_incident_id: uuidSchema.optional().nullable(),
  war_room_channel: z.string().max(1000).optional().nullable(),
});

export const updateMajorIncidentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional().nullable(),
  war_room_channel: z.string().max(1000).optional().nullable(),
});

export const majorIncidentStakeholderUpdateSchema = z.object({
  audience: z.enum(['internal', 'external']).default('external'),
  subject: z.string().max(500).optional().default(''),
  body: z.string().min(1).max(20000),
});

export const majorIncidentRoleSchema = z.object({
  role: z.enum(['commander', 'comms_lead', 'scribe', 'resolver']),
  user_id: uuidSchema,
});

export const majorIncidentRelatedSchema = z.object({
  incident_id: uuidSchema,
  link_reason: z.string().max(500).optional(),
});

export const postmortemUpsertSchema = z.object({
  timeline: z.array(z.record(z.string(), z.unknown())).optional(),
  root_causes: z.array(z.string()).optional(),
  contributing_factors: z.array(z.string()).optional(),
  action_items: z.array(postmortemActionItemSchema).optional(),
  status: z.enum(['draft', 'in_review', 'published']).optional(),
});

export const publishPostmortemSchema = z.object({
  root_causes: z.array(z.string().min(3)).min(1),
  contributing_factors: z.array(z.string().min(3)).min(1),
});

export const majorIncidentListQuerySchema = paginationSchema.extend({
  status: z.string().max(200).optional(),
  status_not_in: z.string().max(200).optional(),
  search: z.string().max(200).optional(),
  sort_by: z.enum(['declared_major_at', 'title', 'status', 'priority', 'number']).optional(),
  sort_dir: z.enum(['asc', 'desc']).optional(),
  priority_lte: z.coerce.number().int().min(1).max(2).optional(),
});

// ─── Type Exports ───
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type ApproveRequestInput = z.infer<typeof approveRequestSchema>;
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
export type AddJournalEntryInput = z.infer<typeof addJournalEntrySchema>;
export type IncidentLinkMajorIncidentInput = z.infer<typeof incidentLinkMajorIncidentSchema>;
export type CreateProblemInput = z.infer<typeof createProblemSchema>;
export type UpdateProblemInput = z.infer<typeof updateProblemSchema>;
export type CreateChangeInput = z.infer<typeof createChangeSchema>;
export type UpdateChangeInput = z.infer<typeof updateChangeSchema>;
export const updateCIClassSchema = createCIClassSchema.partial();

export type CreateCIClassInput = z.infer<typeof createCIClassSchema>;
export type CreateCIInput = z.infer<typeof createCISchema>;
export type UpdateCIInput = z.infer<typeof updateCISchema>;
export type CreateCIRelationshipInput = z.infer<typeof createCIRelationshipSchema>;
export type CreateMajorIncidentInput = z.infer<typeof createMajorIncidentSchema>;
export type UpdateMajorIncidentInput = z.infer<typeof updateMajorIncidentSchema>;
export type MajorIncidentResolveInput = z.infer<typeof majorIncidentResolveSchema>;
