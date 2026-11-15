/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Zod Validation Schemas ───
// Shared request schemas live in `@nova-suite/shared/schemas`. This module
// extends Zod for OpenAPI, re-exports those schemas, and keeps engine-only ones.

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
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
  createCategorySchema,
  updateCategorySchema,
  createServiceItemSchema,
  updateServiceItemSchema,
  fulfillmentModelWriteSchema,
  fulfillmentModelUpdateSchema,
  adminCreateUserSchema,
  adminUpdateUserSchema,
  createCIClassSchema,
  updateCIClassSchema,
  createCISchema,
  updateCISchema,
  createCIRelationshipSchema,
  createAssetSchema,
  updateAssetSchema,
  assignAssetSchema,
  returnAssetSchema,
  createReleaseSchema,
  updateReleaseSchema,
  createImprovementSchema,
  updateImprovementSchema,
  improvementFromPostmortemSchema,
  improvementFromChangeSchema,
  improvementFromProblemSchema,
  addImprovementJournalSchema,
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
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateServiceItemInput,
  UpdateServiceItemInput,
  FulfillmentModelWriteInput,
  FulfillmentModelUpdateInput,
  AdminCreateUserInput,
  AdminUpdateUserInput,
  CreateCIClassInput,
  UpdateCIClassInput,
  CreateCIInput,
  UpdateCIInput,
  CreateCIRelationshipInput,
  CreateAssetInput,
  UpdateAssetInput,
  AssignAssetInput,
  ReturnAssetInput,
  CreateReleaseInput,
  UpdateReleaseInput,
  CreateImprovementInput,
  UpdateImprovementInput,
  ImprovementFromPostmortemInput,
  ImprovementFromChangeInput,
  ImprovementFromProblemInput,
  AddImprovementJournalInput,
} from '@nova-suite/shared/schemas';

import {
  updateAssetSchema,
  updateImprovementSchema,
  updateReleaseSchema,
  uuidSchema,
} from '@nova-suite/shared/schemas';

// Engine SQL patch allow-lists (derived from shared update schemas).
export const ASSET_UPDATE_COLUMNS = Object.keys(updateAssetSchema.shape).filter(
  (key) => key !== 'custom_fields' && key !== 'owner_user_id',
);
export const RELEASE_UPDATE_COLUMNS = Object.keys(updateReleaseSchema.shape);
export const IMPROVEMENT_UPDATE_COLUMNS = Object.keys(updateImprovementSchema.shape);

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
