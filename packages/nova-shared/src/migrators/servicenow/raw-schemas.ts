/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';

/**
 * Table API values with sysparm_display_value=false are strings. Reference fields can still
 * arrive as `{ value, link }` objects when sysparm_exclude_reference_link is not honored.
 */
export const snField = z.preprocess((v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && !Array.isArray(v) && 'value' in (v as Record<string, unknown>)) {
    const inner = (v as Record<string, unknown>).value;
    return inner === null || inner === undefined ? '' : String(inner);
  }
  return typeof v === 'string' ? v : String(v);
}, z.string());

const snBool = snField.transform((v) => v === 'true' || v === '1');
const snInt = snField.transform((v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
});
const snNumber = snField.transform((v) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
});

export const snCatalogSchema = z.object({
  sys_id: snField,
  title: snField,
  description: snField,
  active: snBool,
});

export const snCategorySchema = z.object({
  sys_id: snField,
  title: snField,
  description: snField,
  parent: snField,
  sc_catalog: snField,
  active: snBool,
  order: snInt,
});

export const snCatItemSchema = z.object({
  sys_id: snField,
  name: snField,
  short_description: snField,
  description: snField,
  category: snField,
  sc_catalogs: snField,
  active: snBool,
  price: snNumber,
  flow_designer_flow: snField,
  workflow: snField,
  sys_class_name: snField,
  order: snInt,
});

export const snVariableSchema = z.object({
  sys_id: snField,
  name: snField,
  question_text: snField,
  type: snInt,
  mandatory: snBool,
  default_value: snField,
  help_text: snField,
  tooltip: snField,
  example_text: snField,
  order: snInt,
  cat_item: snField,
  variable_set: snField,
  reference: snField,
  list_table: snField,
  lookup_table: snField,
  lookup_value: snField,
  lookup_label: snField,
  active: snBool,
});

export const snVariableSetSchema = z.object({
  sys_id: snField,
  title: snField,
  internal_name: snField,
  type: snField,
});

export const snVariableSetItemSchema = z.object({
  sys_id: snField,
  sc_cat_item: snField,
  variable_set: snField,
  order: snInt,
});

export const snQuestionChoiceSchema = z.object({
  sys_id: snField,
  question: snField,
  text: snField,
  value: snField,
  order: snInt,
});

export const snFlowSchema = z.object({
  sys_id: snField,
  name: snField,
  internal_name: snField,
  type: snField,
  status: snField,
  active: snBool,
  description: snField,
  sys_scope: snField,
  master_snapshot: snField,
  latest_snapshot: snField,
});

/** Shared shape of sys_hub_action_instance(_v2), sys_hub_flow_logic(_instance_v2), sys_hub_sub_flow_instance(_v2). */
export const snFlowInstanceSchema = z.object({
  sys_id: snField,
  flow: snField,
  ui_id: snField,
  parent_ui_id: snField,
  /** Nested steps use dotted orders such as "2.1". */
  order: snNumber.transform((v) => v ?? 0),
  comment: snField,
  values: snField,
  action_type: snField,
  logic_definition: snField,
  subflow: snField,
  /** Compressed input values of v2 subflow instances (their `values` column is empty). */
  subflow_inputs: snField,
});

/** Published subflow snapshot; subflow instances reference these instead of sys_hub_flow. */
export const snFlowSnapshotSchema = z.object({
  sys_id: snField,
  name: snField,
  internal_name: snField,
  type: snField,
  active: snBool,
  description: snField,
  sys_scope: snField,
  parent_flow: snField,
});

export const snTriggerInstanceSchema = z.object({
  sys_id: snField,
  flow: snField,
  trigger_definition: snField,
  'trigger_definition.name': snField,
  trigger_type: snField,
});

export const snActionTypeSchema = z.object({
  sys_id: snField,
  name: snField,
  internal_name: snField,
  sys_scope: snField,
  category: snField,
});

export const snLogicDefinitionSchema = z.object({
  sys_id: snField,
  name: snField,
  type: snField,
});

export const snLegacyWorkflowSchema = z.object({
  sys_id: snField,
  name: snField,
  description: snField,
  table: snField,
});

export const snLegacyVersionSchema = z.object({
  sys_id: snField,
  name: snField,
  workflow: snField,
  published: snBool,
});

export const snLegacyActivitySchema = z.object({
  sys_id: snField,
  name: snField,
  activity_definition: snField,
  workflow_version: snField,
  x: snInt,
  y: snInt,
});

export const snLegacyElementSchema = z.object({
  sys_id: snField,
  name: snField,
});

export const snLegacyTransitionSchema = z.object({
  sys_id: snField,
  from: snField,
  to: snField,
  condition: snField,
  name: snField,
});

export const snLegacyConditionSchema = z.object({
  sys_id: snField,
  name: snField,
  condition: snField,
});

export const snFlowVariableSchema = z.object({
  sys_id: snField,
  model: snField,
  element: snField,
  label: snField,
  internal_type: snField,
});

export const snVariableValueSchema = z.object({
  document_key: snField,
  value: snField,
  'variable.element': snField,
});

export const snGroupSchema = z.object({
  sys_id: snField,
  name: snField,
});

export const snUserSchema = z.object({
  sys_id: snField,
  user_name: snField,
  email: snField,
});

export type SnGroup = z.infer<typeof snGroupSchema>;
export type SnUser = z.infer<typeof snUserSchema>;
export type SnCatalog = z.infer<typeof snCatalogSchema>;
export type SnCategory = z.infer<typeof snCategorySchema>;
export type SnCatItem = z.infer<typeof snCatItemSchema>;
export type SnVariable = z.infer<typeof snVariableSchema>;
export type SnVariableSet = z.infer<typeof snVariableSetSchema>;
export type SnVariableSetItem = z.infer<typeof snVariableSetItemSchema>;
export type SnQuestionChoice = z.infer<typeof snQuestionChoiceSchema>;
export type SnFlow = z.infer<typeof snFlowSchema>;
export type SnFlowInstance = z.infer<typeof snFlowInstanceSchema>;
export type SnTriggerInstance = z.infer<typeof snTriggerInstanceSchema>;
export type SnActionType = z.infer<typeof snActionTypeSchema>;
export type SnLogicDefinition = z.infer<typeof snLogicDefinitionSchema>;
export type SnFlowVariable = z.infer<typeof snFlowVariableSchema>;
export type SnVariableValue = z.infer<typeof snVariableValueSchema>;

export function fieldsOf(schema: z.ZodObject): string {
  return Object.keys(schema.shape).join(',');
}
