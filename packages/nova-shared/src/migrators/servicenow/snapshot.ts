/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';
import {
  snActionTypeSchema,
  snCatalogSchema,
  snCategorySchema,
  snCatItemSchema,
  snFlowSchema,
  snGroupSchema,
  snLogicDefinitionSchema,
  snUserSchema,
  snQuestionChoiceSchema,
  snVariableSchema,
  snVariableSetItemSchema,
  snVariableSetSchema,
} from './raw-schemas';

export const SERVICENOW_SNAPSHOT_VERSION = 1;

export const serviceNowStepSchema = z.object({
  kind: z.enum(['action', 'logic', 'subflow']),
  sysId: z.string(),
  uiId: z.string(),
  parentUiId: z.string(),
  order: z.number(),
  comment: z.string(),
  /** Action type or logic definition sys_id. */
  definitionId: z.string(),
  /** Subflow sys_id for kind=subflow. */
  subflowId: z.string(),
  /** Decoded inputs (name -> value). */
  values: z.record(z.string(), z.unknown()),
});

export const serviceNowFlowSchema = snFlowSchema.extend({
  storage: z.enum(['v1', 'v2', 'none']),
  /** sys_id of the record the steps were read from (published snapshot or the flow itself). */
  sourceRecordId: z.string(),
  triggerName: z.string(),
  steps: z.array(serviceNowStepSchema),
  flowVariables: z.array(z.object({ name: z.string(), label: z.string(), type: z.string() })),
});

export const serviceNowSnapshotSchema = z.object({
  version: z.literal(SERVICENOW_SNAPSHOT_VERSION),
  instanceUrl: z.string(),
  extractedAt: z.string(),
  release: z.string().nullable(),
  catalogs: z.array(snCatalogSchema),
  categories: z.array(snCategorySchema),
  items: z.array(snCatItemSchema),
  variables: z.array(snVariableSchema),
  variableSets: z.array(snVariableSetSchema),
  variableSetItems: z.array(snVariableSetItemSchema),
  choices: z.array(snQuestionChoiceSchema),
  flows: z.array(serviceNowFlowSchema),
  actionTypes: z.array(snActionTypeSchema),
  logicDefinitions: z.array(snLogicDefinitionSchema),
  /** Groups and users referenced by sys_id in flow step values (approvers, assignment groups). */
  groups: z.array(snGroupSchema).default([]),
  users: z.array(snUserSchema).default([]),
  warnings: z.array(z.string()),
});

export type ServiceNowStep = z.infer<typeof serviceNowStepSchema>;
export type ServiceNowFlow = z.infer<typeof serviceNowFlowSchema>;
export type ServiceNowSnapshot = z.infer<typeof serviceNowSnapshotSchema>;

export const serviceNowExtractOptionsSchema = z.object({
  catalogIds: z.array(z.string().regex(/^[0-9a-f]{32}$/)).max(50).default([]),
  categoryIds: z.array(z.string().regex(/^[0-9a-f]{32}$/)).max(200).default([]),
  itemIds: z.array(z.string().regex(/^[0-9a-f]{32}$/)).max(1000).default([]),
  includeRecordProducers: z.boolean().default(false),
  includeInactive: z.boolean().default(false),
  maxItems: z.number().int().min(1).max(2000).default(500),
});

export type ServiceNowExtractOptions = z.infer<typeof serviceNowExtractOptionsSchema>;
