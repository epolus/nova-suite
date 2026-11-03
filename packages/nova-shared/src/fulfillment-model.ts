/* SPDX-License-Identifier: AGPL-3.0-only */
import { z } from 'zod';
import { replacePlaceholders } from './placeholders';

export const FULFILLMENT_MODEL_KIND = 'fulfillment_model' as const;

export const FULFILLMENT_CI_STATUSES = ['installed', 'in_stock', 'maintenance', 'retired', 'planned'] as const;
export type FulfillmentCiStatus = (typeof FULFILLMENT_CI_STATUSES)[number];

export const DEFAULT_CI_NAME_TEMPLATE = '{{item.name}} {{request.number}}';
export const DEFAULT_CI_DISPLAY_NAME_TEMPLATE = '{{item.name}} {{request.number}}';
export const DEFAULT_ASSET_NAME_TEMPLATE = '{{item.name}} {{request.number}}';
export const DEFAULT_ASSET_TAG_TEMPLATE = '{{request.number}}';

const TEMPLATE_TOKEN = /^(request\.number|item\.name|form\.[A-Za-z_][A-Za-z0-9_-]*)$/;

const emptyToNull = (value: unknown) => (value === '' || value === undefined ? null : value);

const optionalUuid = z.preprocess(emptyToNull, z.guid().nullable().optional());

const taskSchema = z.object({
  name: z.string().trim().max(200).optional().default(''),
  instructions: z.string().trim().max(4000).nullable().optional(),
  assigned_group_id: optionalUuid,
  sla_hours: z.number().int().min(1).max(8760).nullable().optional(),
});

const MAX_GROUP_TASKS = 20;

const ciSchema = z.object({
  enabled: z.boolean(),
  class_id: optionalUuid,
  name_template: z.string().trim().max(200).optional().default(DEFAULT_CI_NAME_TEMPLATE),
  display_name_template: z.string().trim().max(200).optional().default(DEFAULT_CI_DISPLAY_NAME_TEMPLATE),
  status: z.enum(FULFILLMENT_CI_STATUSES).optional().default('installed'),
});

const assetSchema = z.object({
  enabled: z.boolean(),
  category: z.string().trim().max(100).optional().default('hardware'),
  name_template: z.string().trim().max(200).optional().default(DEFAULT_ASSET_NAME_TEMPLATE),
  asset_tag_template: z.string().trim().max(100).optional().default(DEFAULT_ASSET_TAG_TEMPLATE),
});

export const fulfillmentModelConfigSchema = z.object({
  tasks: z.array(taskSchema).max(MAX_GROUP_TASKS).default([]),
  ci: ciSchema,
  asset: assetSchema,
}).superRefine((config, ctx) => {
  if (config.tasks.length === 0 && !config.ci.enabled && !config.asset.enabled) {
    ctx.addIssue({
      code: 'custom',
      message: 'Enable a group task, a configuration item, or an asset',
      path: ['tasks'],
    });
  }
  config.tasks.forEach((task, index) => {
    if (!task.name.trim()) {
      ctx.addIssue({ code: 'custom', message: 'Task name is required', path: ['tasks', index, 'name'] });
    }
    if (!task.assigned_group_id) {
      ctx.addIssue({
        code: 'custom',
        message: 'Assignment group is required',
        path: ['tasks', index, 'assigned_group_id'],
      });
    }
  });
  if (config.ci.enabled) {
    if (!config.ci.class_id) {
      ctx.addIssue({ code: 'custom', message: 'CI class is required', path: ['ci', 'class_id'] });
    }
    addTemplateIssue(ctx, config.ci.name_template, ['ci', 'name_template']);
    addTemplateIssue(ctx, config.ci.display_name_template, ['ci', 'display_name_template']);
  }
  if (config.asset.enabled) {
    if (!config.asset.category.trim()) {
      ctx.addIssue({ code: 'custom', message: 'Asset category is required', path: ['asset', 'category'] });
    }
    addTemplateIssue(ctx, config.asset.name_template, ['asset', 'name_template']);
    addTemplateIssue(ctx, config.asset.asset_tag_template, ['asset', 'asset_tag_template']);
  }
});

export type FulfillmentModelConfig = z.infer<typeof fulfillmentModelConfigSchema>;

function addTemplateIssue(ctx: z.RefinementCtx, template: string, path: (string | number)[]): void {
  const error = fulfillmentTemplateError(template);
  if (error) ctx.addIssue({ code: 'custom', message: error, path });
}

/** Why a template cannot be saved. Null when every `{{...}}` token is supported. */
export function fulfillmentTemplateError(template: string): string | null {
  if (!template.trim()) return 'Template is empty';
  let error: string | null = null;
  replacePlaceholders(template, (inner) => {
    const key = inner.trim();
    if (!TEMPLATE_TOKEN.test(key)) error = `Unsupported placeholder {{${inner}}}`;
    return '';
  });
  return error;
}

export function fulfillmentModelConfigErrors(value: unknown): string[] {
  const parsed = fulfillmentModelConfigSchema.safeParse(value);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return `${path}${issue.message}`;
  });
}

export function parseFulfillmentModelConfig(value: unknown): FulfillmentModelConfig | null {
  const parsed = fulfillmentModelConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type FulfillmentTemplateContext = {
  requestNumber: string;
  itemName: string;
  formData: Record<string, unknown>;
};

/** Renders `{{request.number}}`, `{{item.name}}`, and `{{form.<field>}}`. Unknown tokens become empty. */
export function renderFulfillmentTemplate(template: string, context: FulfillmentTemplateContext): string {
  return replacePlaceholders(template, (inner) => {
    const key = inner.trim();
    if (key === 'request.number') return context.requestNumber;
    if (key === 'item.name') return context.itemName;
    if (key.startsWith('form.')) {
      const field = key.slice('form.'.length);
      const value = context.formData[field];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    }
    return '';
  }).trim();
}

export type CompiledFulfillmentTask = {
  id: null;
  name: string;
  description: string | null;
  instructions: string | null;
  taskType: 'approval' | 'manual' | 'automated';
  taskOrder: number;
  assignedGroupId: string | null;
  slaHours: number | null;
  automationConfig: Record<string, unknown>;
};

export function isFulfillmentModelAutomation(config: unknown): boolean {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  return (config as { kind?: unknown }).kind === FULFILLMENT_MODEL_KIND;
}

/** Synthetic catalog tasks for an item that uses a fulfillment model. Catalog tasks are not included. */
export function compileFulfillmentModelTasks(input: {
  approvalRequired: boolean;
  config: FulfillmentModelConfig;
}): CompiledFulfillmentTask[] {
  const tasks: CompiledFulfillmentTask[] = [];
  if (input.approvalRequired) {
    tasks.push({
      id: null,
      name: 'Manager Approval',
      description: 'Approval required before fulfillment tasks can proceed',
      instructions: 'Please review and approve or reject this request.',
      taskType: 'approval',
      taskOrder: 0,
      assignedGroupId: null,
      slaHours: null,
      automationConfig: {},
    });
  }
  input.config.tasks.forEach((task, index) => {
    if (!task.assigned_group_id) return;
    tasks.push({
      id: null,
      name: task.name.trim(),
      description: null,
      instructions: task.instructions?.trim() || null,
      taskType: 'manual',
      taskOrder: index + 1,
      assignedGroupId: task.assigned_group_id,
      slaHours: task.sla_hours ?? null,
      automationConfig: {},
    });
  });
  if (input.config.ci.enabled || input.config.asset.enabled) {
    tasks.push({
      id: null,
      name: provisionTaskName(input.config),
      description: 'Assign the created record to the person the request is for.',
      instructions: null,
      taskType: 'automated',
      taskOrder: input.config.tasks.length + 1,
      assignedGroupId: null,
      slaHours: null,
      automationConfig: { kind: FULFILLMENT_MODEL_KIND },
    });
  }
  return tasks;
}

function provisionTaskName(config: FulfillmentModelConfig): string {
  if (config.ci.enabled && config.asset.enabled) return 'Create CI and asset';
  if (config.ci.enabled) return 'Create configuration item';
  return 'Create asset';
}

export type ServiceItemFulfillmentIssue = 'model_and_tasks' | 'inactive_model' | 'activate_requires_task';

/** An item uses a fulfillment model or catalog tasks. Active items need one of those. */
export function serviceItemFulfillmentIssue(input: {
  fulfillmentModelId: string | null;
  modelActive: boolean;
  catalogTaskCount: number;
  activeCatalogTaskCount: number;
  activating: boolean;
}): ServiceItemFulfillmentIssue | null {
  if (input.fulfillmentModelId && input.catalogTaskCount > 0) return 'model_and_tasks';
  if (input.fulfillmentModelId && input.activating && !input.modelActive) return 'inactive_model';
  if (!input.fulfillmentModelId && input.activating && input.activeCatalogTaskCount === 0) {
    return 'activate_requires_task';
  }
  return null;
}

export type RequestFulfillmentIssue = 'inactive_model' | 'model_and_tasks' | 'model_not_found';

export function requestWorkflowAction(input: {
  fulfillmentModelId: string | null;
  modelFound: boolean;
  modelActive: boolean;
  catalogTaskCount: number;
  activeCatalogTaskCount: number;
}): { action: 'start' | 'legacy'; issue: null } | { action: null; issue: RequestFulfillmentIssue } {
  if (input.fulfillmentModelId) {
    if (!input.modelFound) return { action: null, issue: 'model_not_found' };
    if (!input.modelActive) return { action: null, issue: 'inactive_model' };
    if (input.catalogTaskCount > 0) return { action: null, issue: 'model_and_tasks' };
    return { action: 'start', issue: null };
  }
  if (input.activeCatalogTaskCount > 0) return { action: 'start', issue: null };
  return { action: 'legacy', issue: null };
}
