/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Zod Validation Schemas ───
// Shared request schemas live in `@nova-suite/shared/schemas`. This module
// extends Zod for OpenAPI, re-exports those schemas, and keeps engine-only ones.

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { fulfillmentModelConfigErrors } from '@nova-suite/shared';
import { serviceNowExtractOptionsSchema } from '@nova-suite/shared/migrators/servicenow';

extendZodWithOpenApi(z);

export {
  uuidSchema,
  paginationSchema,
  rankedSuggestionsQuerySchema,
  e164PhoneSchema,
  loginSchema,
  registerSchema,
  createIncidentSchema,
  updateIncidentSchema,
  incidentLinkMajorIncidentSchema,
  addJournalEntrySchema,
  createRequestSchema,
  batchRequestSchema,
  approveRequestSchema,
  createProblemSchema,
  updateProblemSchema,
  createChangeSchema,
  updateChangeSchema,
  changeTransitionSchema,
  changeApprovalDecisionSchema,
  createChangeTypeSchema,
  updateChangeTypeSchema,
  createCabMeetingSchema,
  createBlackoutSchema,
  updateBlackoutSchema,
  createChangeRiskQuestionSchema,
  updateChangeRiskQuestionSchema,
  submitChangeRiskAssessmentSchema,
  addChangeJournalEntrySchema,
  postmortemActionItemSchema,
  postmortemActionItemCreateSchema,
  postmortemFollowUpSchema,
  createMajorIncidentSchema,
  updateMajorIncidentSchema,
  majorIncidentStakeholderUpdateSchema,
  majorIncidentRoleSchema,
  majorIncidentRelatedSchema,
  majorIncidentResolveSchema,
  postmortemUpsertSchema,
  publishPostmortemSchema,
  majorIncidentListQuerySchema,
} from '@nova-suite/shared/schemas';
export type {
  LoginInput,
  RegisterInput,
  CreateIncidentInput,
  CreateIncident,
  UpdateIncidentInput,
  UpdateIncident,
  AddJournalEntryInput,
  AddJournalEntry,
  CreateRequestInput,
  CreateRequest,
  BatchRequestInput,
  ApproveRequestInput,
  CreateProblemInput,
  UpdateProblemInput,
  CreateChangeInput,
  UpdateChangeInput,
  ChangeTransitionInput,
  ChangeApprovalDecisionInput,
  CreateChangeTypeInput,
  UpdateChangeTypeInput,
  CreateCabMeetingInput,
  CreateBlackoutInput,
  UpdateBlackoutInput,
  CreateChangeRiskQuestionInput,
  UpdateChangeRiskQuestionInput,
  SubmitChangeRiskAssessmentInput,
  AddChangeJournalEntryInput,
  CreateMajorIncidentInput,
  CreateMajorIncident,
  UpdateMajorIncidentInput,
  MajorIncidentStakeholderUpdateInput,
  MajorIncidentRoleInput,
  MajorIncidentRelatedInput,
  MajorIncidentResolveInput,
  PostmortemActionItemCreateInput,
  PostmortemFollowUpInput,
  PostmortemUpsertInput,
  PublishPostmortemInput,
} from '@nova-suite/shared/schemas';

import {
  e164PhoneSchema,
  uuidSchema,
} from '@nova-suite/shared/schemas';

// ─── Service Catalog ───
export const createCategorySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  icon: z.string().max(50).optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  icon: z.string().max(50).optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export const createServiceItemSchema = z.object({
  category_id: uuidSchema,
  name: z.string().min(1).max(255),
  short_description: z.string().max(500).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  icon: z.string().max(50).optional(),
  price: z.number().min(0).optional().nullable(),
  custom_attributes: z.record(z.string(), z.unknown()).default({}),
  form_schema: z
    .object({ fields: z.array(z.record(z.string(), z.unknown())) })
    .default({ fields: [] }),
  approval_required: z.boolean().default(false),
  sla_hours: z.number().int().min(1).optional(),
  fulfillment_model_id: uuidSchema.nullable().optional(),
});

export const fulfillmentModelWriteSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
  config: z.unknown(),
}).superRefine((body, ctx) => {
  const errors = fulfillmentModelConfigErrors(body.config);
  if (errors.length > 0) {
    ctx.addIssue({ code: 'custom', message: errors.join('; '), path: ['config'] });
  }
});

export const fulfillmentModelUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
  config: z.unknown().optional(),
}).superRefine((body, ctx) => {
  if (body.config === undefined) return;
  const errors = fulfillmentModelConfigErrors(body.config);
  if (errors.length > 0) {
    ctx.addIssue({ code: 'custom', message: errors.join('; '), path: ['config'] });
  }
});

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

const configPackageFulfillmentTaskSchema = z.object({
  name: z.string().min(1).max(200),
  instructions: nullableStringSchema,
  assigned_group_name: nullableStringSchema,
  sla_hours: z.number().int().min(1).nullable().optional(),
});

export const configPackageFulfillmentModelSchema = z.object({
  external_key: configExternalKeySchema,
  name: z.string().min(1).max(255),
  description: nullableStringSchema,
  is_active: z.boolean().default(true),
  tasks: z.array(configPackageFulfillmentTaskSchema).max(20).default([]),
  ci: z.object({
    enabled: z.boolean(),
    class_name: nullableStringSchema,
    name_template: z.string().max(200).default('{{item.name}} {{request.number}}'),
    display_name_template: z.string().max(200).default('{{item.name}} {{request.number}}'),
    status: z.enum(['installed', 'in_stock', 'maintenance', 'retired', 'planned']).default('installed'),
  }),
  asset: z.object({
    enabled: z.boolean(),
    category: z.string().max(100).default('hardware'),
    name_template: z.string().max(200).default('{{item.name}} {{request.number}}'),
    asset_tag_template: z.string().max(100).default('{{request.number}}'),
  }),
});

export const configPackageServiceItemSchema = z.object({
  external_key: configExternalKeySchema,
  category_external_key: configExternalKeySchema,
  fulfillment_model_external_key: configExternalKeySchema.nullable().optional(),
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
  entity_type: z.enum(['incident', 'request', 'change', 'problem', 'knowledge', 'major_incident', 'alert']).default('incident'),
  trigger_key: z.string().min(1).max(100),
  recipient_type: z.string().min(1).max(100),
  recipient_user_email: z.string().email().nullable().optional(),
  recipient_group_name: z.string().min(1).max(255).nullable().optional(),
  channels: z.array(z.enum(['in_app', 'email', 'slack', 'teams'])).min(1).default(['in_app']),
  templates: z.array(configPackageNotificationRuleTemplateSchema).min(1),
  title_template: z.string().min(1).optional(),
  body_template: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(100),
});

export const configPackageDataSourceSchema = z.object({
  external_key: configExternalKeySchema,
  name: z.string().min(1).max(255),
  description: nullableStringSchema,
  entity_type: z.string().min(1).max(100),
  source_type: z.enum(['csv_url', 'json_url', 'rest_api', 'sftp', 'intune']).default('csv_url'),
  /** Connection config without inline secrets (credential_slug is preferred). */
  source_config: z.record(z.string(), z.unknown()).default({}),
  column_mapping: z.record(z.string(), z.unknown()).default({}),
  schedule_cron: z.string().min(1).max(100).default('0 2 * * *'),
  schedule_enabled: z.boolean().default(false),
  import_mode: z.enum(['insert', 'upsert', 'full_sync']).default('insert'),
  upsert_key: nullableStringSchema,
});

export const configPackageWorkflowDefinitionSchema = z.object({
  name: z.string().min(1).max(255),
  workflow_type: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9_.-]*$/),
  description: nullableStringSchema,
  /** Published as-is; call.workflow resolves the latest active definition by workflow_type. */
  definition: z.record(z.string(), z.unknown()),
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
      fulfillment_models: z.array(configPackageFulfillmentModelSchema).default([]),
      service_items: z.array(configPackageServiceItemSchema).default([]),
    }).default({ categories: [], fulfillment_models: [], service_items: [] }),
    notifications: z.object({
      rules: z.array(configPackageNotificationRuleSchema).default([]),
    }).default({ rules: [] }),
    data_sources: z.object({
      sources: z.array(configPackageDataSourceSchema).default([]),
    }).default({ sources: [] }),
    workflows: z.object({
      definitions: z.array(configPackageWorkflowDefinitionSchema).default([]),
    }).default({ definitions: [] }),
  }).default({
    catalog: { categories: [], fulfillment_models: [], service_items: [] },
    notifications: { rules: [] },
    data_sources: { sources: [] },
    workflows: { definitions: [] },
  }),
});

export const configPackageApplySchema = z.object({
  package: configPackageBundleSchema,
});

// ─── ServiceNow catalog migrator ───
export const serviceNowConnectionSchema = z.object({
  instance_url: z.string().trim().min(1).max(255),
  credential_slug: z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/),
});

export const serviceNowCreateRunSchema = serviceNowConnectionSchema.extend({
  options: serviceNowExtractOptionsSchema.default({
    catalogIds: [],
    categoryIds: [],
    itemIds: [],
    includeRecordProducers: false,
    includeInactive: false,
    maxItems: 500,
  }),
});

export const serviceNowApplySchema = z.object({
  item_keys: z.array(z.string().min(1).max(160)).min(1).max(2000),
  /** Create assignment groups referenced by tasks that do not exist yet; otherwise tasks are left unassigned. */
  create_missing_groups: z.boolean().default(false),
});

// ─── Admin users ───
export const adminCreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  display_name: z.string().min(1).max(255),
  phone: e164PhoneSchema.optional().nullable(),
  mobile: e164PhoneSchema.optional().nullable(),
  vip: z.boolean().optional(),
  employee_number: z.string().max(100).optional().nullable(),
  locked_out: z.boolean().optional(),
  lock_reason: z.string().max(200).optional().nullable(),
}).loose();

export const adminUpdateUserSchema = z.object({
  phone: e164PhoneSchema.optional().nullable(),
  mobile: e164PhoneSchema.optional().nullable(),
  vip: z.boolean().optional(),
  employee_number: z.string().max(100).optional().nullable(),
  locked_out: z.boolean().optional(),
  lock_reason: z.string().max(200).optional().nullable(),
}).loose();

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
  status: z.enum(['installed', 'in_stock', 'maintenance', 'retired', 'planned']).default('installed'),
  environment: z.enum(['production', 'staging', 'development', 'test']).default('production'),
  attributes: z.record(z.string(), z.unknown()).default({}),
  managed_by: uuidSchema.optional().nullable(),
  assigned_to: uuidSchema.optional().nullable(),
  supported_by: uuidSchema.optional().nullable(),
  location_id: uuidSchema.optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  external_id_1: z.string().max(255).optional().nullable(),
  external_id_2: z.string().max(255).optional().nullable(),
  is_active: z.boolean().optional().default(true),
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

// ─── Assets ───
const assetCategorySchema = z.enum(['hardware', 'software', 'license', 'consumable']);
const assetStatusSchema = z.enum([
  'ordered',
  'received',
  'in_stock',
  'in_use',
  'maintenance',
  'retired',
  'disposed',
]);

export const createAssetSchema = z.object({
  asset_tag: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  category: assetCategorySchema.optional(),
  status: assetStatusSchema.optional(),
  owner_user_id: uuidSchema.nullable().optional(),
  linked_ci_id: uuidSchema.nullable().optional(),
  vendor_name: z.string().max(255).nullable().optional(),
  purchase_cost: z.number().nullable().optional(),
  purchase_currency: z.string().max(8).nullable().optional(),
  purchase_date: z.string().max(32).nullable().optional(),
  warranty_expires_at: z.string().max(32).nullable().optional(),
  contract_ref: z.string().max(255).nullable().optional(),
  depreciation_months: z.number().int().nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  external_id_1: z.string().max(255).nullable().optional(),
  external_id_2: z.string().max(255).nullable().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
});

export const updateAssetSchema = createAssetSchema.partial();
export const ASSET_UPDATE_COLUMNS = Object.keys(updateAssetSchema.shape).filter(
  (key) => key !== 'custom_fields' && key !== 'owner_user_id',
);

export const assignAssetSchema = z.object({
  user_id: uuidSchema,
  notes: z.string().max(5000).nullable().optional(),
});

export const returnAssetSchema = z.object({
  notes: z.string().max(5000).nullable().optional(),
});

// ─── Releases ───
const releaseStatusSchema = z.enum(['planned', 'in_progress', 'deployed', 'cancelled']);
const releaseTypeSchema = z.enum(['major', 'minor', 'emergency']);
const releaseRiskSchema = z.enum(['low', 'medium', 'high']);

export const createReleaseSchema = z.object({
  number: z.string().min(1).max(64).optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  status: releaseStatusSchema.optional(),
  release_type: releaseTypeSchema.optional(),
  risk_level: releaseRiskSchema.optional(),
  planned_start: z.string().max(64).nullable().optional(),
  planned_end: z.string().max(64).nullable().optional(),
  deployed_at: z.string().max(64).nullable().optional(),
  owner_user_id: uuidSchema.nullable().optional(),
  change_id: uuidSchema.nullable().optional(),
  validation_notes: z.string().max(10000).nullable().optional(),
  rollback_plan: z.string().max(10000).nullable().optional(),
});

export const updateReleaseSchema = createReleaseSchema.partial();
export const RELEASE_UPDATE_COLUMNS = Object.keys(updateReleaseSchema.shape);

// ─── Continual improvement ───
const improvementStatusSchema = z.enum(['registered', 'in_progress', 'done', 'cancelled']);

export const createImprovementSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
});

export const updateImprovementSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  status: improvementStatusSchema.optional(),
  owner_user_id: uuidSchema.nullable().optional(),
});
export const IMPROVEMENT_UPDATE_COLUMNS = Object.keys(updateImprovementSchema.shape);

export const improvementFromPostmortemSchema = z.object({
  major_incident_id: uuidSchema,
  action_item_id: uuidSchema,
});

export const improvementFromChangeSchema = z.object({
  change_id: uuidSchema,
});

export const improvementFromProblemSchema = z.object({
  problem_id: uuidSchema,
});

export const addImprovementJournalSchema = z.object({
  entry_type: z.enum(['comment', 'work_note']).default('comment'),
  content: z.string().min(1).max(10000),
});

export const updateCIClassSchema = createCIClassSchema.partial();
