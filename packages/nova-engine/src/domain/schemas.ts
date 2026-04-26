/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Zod Validation Schemas ───
// Central definition of all request/response shapes.

import { z } from 'zod';

// ─── Common ───
export const uuidSchema = z.string().uuid();
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
  company: z.string().uuid().optional(),
  preferred_language: z.string().max(10).default('en'),
  start_date: z.string().optional(),
  last_working_date: z.string().optional(),
  user_id: z.string().max(100).optional(),
  manager_id: z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
  cost_center_id: z.string().uuid().optional(),
  role_ids: z.array(z.string().uuid()).min(1).default([]),
});

// ─── Service Catalog ───
export const createCategorySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  icon: z.string().max(50).optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const createServiceItemSchema = z.object({
  category_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  short_description: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  icon: z.string().max(50).optional(),
  price: z.number().min(0).optional().nullable(),
  custom_attributes: z.record(z.unknown()).default({}),
  form_schema: z
    .object({ fields: z.array(z.record(z.unknown())) })
    .default({ fields: [] }),
  approval_required: z.boolean().default(false),
  sla_hours: z.number().int().min(1).optional(),
});

export const updateServiceItemSchema = createServiceItemSchema.partial();

// ─── Requests (User Portal) ───
export const createRequestSchema = z.object({
  service_item_id: z.string().uuid(),
  form_data: z.record(z.unknown()).default({}),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  notes: z.string().max(5000).optional(),
  requested_for: z.string().uuid().optional(),
  delivery_info: z.object({
    location: z.string().max(500).optional(),
    date_needed: z.string().optional(),
    instructions: z.string().max(2000).optional(),
  }).default({}),
  batch_id: z.string().uuid().optional(),
});

export const batchRequestSchema = z.object({
  items: z.array(z.object({
    service_item_id: z.string().uuid(),
    form_data: z.record(z.unknown()).default({}),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    notes: z.string().max(5000).optional(),
  })).min(1).max(50),
  requested_for: z.string().uuid().optional(),
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
  assigned_to: z.string().uuid().optional(),
  assignment_group_id: z.string().uuid().optional(),
  caller_id: z.string().uuid().optional(),
  contact_info: z.string().max(1000).optional(),
  service_id: z.string().uuid().optional(),
  configuration_item_id: z.string().uuid().optional(),
  category: z.string().max(255).optional(),
  subcategory: z.string().max(255).optional(),
  request_id: z.string().uuid().optional(),
});

export const updateIncidentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  status: z
    .enum(['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed', 'cancelled'])
    .optional(),
  impact: z.enum(['low', 'medium', 'high']).optional(),
  urgency: z.enum(['low', 'medium', 'high']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  assignment_group_id: z.string().uuid().nullable().optional(),
  caller_id: z.string().uuid().nullable().optional(),
  contact_info: z.string().max(1000).nullable().optional(),
  service_id: z.string().uuid().nullable().optional(),
  configuration_item_id: z.string().uuid().nullable().optional(),
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
  reported_by: z.string().uuid().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  assignment_group_id: z.string().uuid(),
  affected_ci: z.string().uuid().nullable().optional(),
  resolution_notes: z.string().max(10000).optional(),
});

export const updateProblemSchema = createProblemSchema.partial();

// ─── Changes ───
export const createChangeSchema = z.object({
  change_type_id: z.string().uuid(),
  standard_change_id: z.string().uuid().nullable().optional(),
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
  requested_by: z.string().uuid().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  assignment_group_id: z.string().uuid(),
  service_id: z.string().uuid().nullable().optional(),
  affected_cis: z.array(z.string().uuid()).default([]),
  scheduled_start: z.string().nullable().optional(),
  scheduled_end: z.string().nullable().optional(),
  actual_start: z.string().nullable().optional(),
  actual_end: z.string().nullable().optional(),
  downtime_required: z.boolean().optional(),
  maintenance_window: z.string().max(100).optional(),
  implementation_notes: z.string().max(10000).optional(),
  success: z.boolean().nullable().optional(),
  actual_downtime_minutes: z.number().int().min(0).nullable().optional(),
  related_problem_id: z.string().uuid().nullable().optional(),
  related_incident_id: z.string().uuid().nullable().optional(),
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
  approval_config: z.record(z.unknown()).optional(),
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

export const createBlackoutSchema = z.object({
  name: z.string().min(1).max(255),
  start_date: z.string(),
  end_date: z.string(),
  reason: z.string().max(2000).optional(),
});

export const updateBlackoutSchema = createBlackoutSchema.partial();

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
  parent_class: z.string().uuid().optional(),
  attributes: z.record(z.unknown()).default({}),
  icon: z.string().max(50).optional(),
  is_active: z.boolean().optional().default(true),
});

export const createCISchema = z.object({
  class_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  display_name: z.string().max(255).optional().nullable(),
  status: z.enum(['active', 'maintenance', 'retired', 'planned']).default('active'),
  environment: z.enum(['production', 'staging', 'development', 'test']).default('production'),
  attributes: z.record(z.unknown()).default({}),
  managed_by: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  supported_by: z.string().uuid().optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const updateCISchema = createCISchema.partial();

export const createCIRelationshipSchema = z.object({
  source_ci_id: z.string().uuid(),
  target_ci_id: z.string().uuid(),
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

// ─── Type Exports ───
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type ApproveRequestInput = z.infer<typeof approveRequestSchema>;
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
export type AddJournalEntryInput = z.infer<typeof addJournalEntrySchema>;
export type CreateProblemInput = z.infer<typeof createProblemSchema>;
export type UpdateProblemInput = z.infer<typeof updateProblemSchema>;
export type CreateChangeInput = z.infer<typeof createChangeSchema>;
export type UpdateChangeInput = z.infer<typeof updateChangeSchema>;
export const updateCIClassSchema = createCIClassSchema.partial();

export type CreateCIClassInput = z.infer<typeof createCIClassSchema>;
export type CreateCIInput = z.infer<typeof createCISchema>;
export type UpdateCIInput = z.infer<typeof updateCISchema>;
export type CreateCIRelationshipInput = z.infer<typeof createCIRelationshipSchema>;
