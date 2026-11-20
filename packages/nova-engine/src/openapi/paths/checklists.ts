/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { uuidSchema } from '../../domain/schemas';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const entityTypeSchema = z.enum(['incident', 'change']);

const templateItemSchema = z.object({
  label: z.string().min(1).max(500),
  sort_order: z.coerce.number().int().optional(),
  required: z.boolean().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  entity_type: entityTypeSchema,
  description: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
  items: z.array(templateItemSchema).min(1),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
  items: z.array(templateItemSchema).min(1).optional(),
});

const listQuerySchema = z.object({
  entity_type: entityTypeSchema.optional(),
  entity_id: uuidSchema.optional(),
});

const applyBodySchema = z.object({
  entity_type: entityTypeSchema,
  entity_id: uuidSchema,
  template_id: uuidSchema,
});

const toggleBodySchema = z.object({
  is_done: z.boolean(),
});

const itemIdParam = z.object({ itemId: uuidSchema });
const instanceIdParam = z.object({ instanceId: uuidSchema });

export function registerChecklistPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/admin/checklist-templates', 'Checklists', 'List checklist templates (admin)', {
    200: { description: 'Templates' },
    403: { description: 'Admin / checklist_admin' },
  }, { query: z.object({ entity_type: entityTypeSchema.optional(), include_inactive: z.string().optional() }).loose() });

  registerOp(registry, 'post', '/admin/checklist-templates', 'Checklists', 'Create checklist template', {
    201: { description: 'Created' },
  }, jsonBody(createTemplateSchema));

  registerOp(registry, 'get', '/admin/checklist-templates/{id}', 'Checklists', 'Get checklist template', {
    200: { description: 'Template' },
    404: { description: 'Not found' },
  }, { params: uuidParam });

  registerOp(registry, 'patch', '/admin/checklist-templates/{id}', 'Checklists', 'Update checklist template', {
    200: { description: 'Updated' },
  }, { params: uuidParam, ...jsonBody(updateTemplateSchema) });

  registerOp(registry, 'delete', '/admin/checklist-templates/{id}', 'Checklists', 'Delete checklist template', {
    200: { description: 'Deleted' },
  }, { params: uuidParam });

  registerOp(registry, 'get', '/checklists/templates', 'Checklists', 'List active templates for agents', {
    200: { description: 'Templates' },
  }, { query: z.object({ entity_type: entityTypeSchema.optional() }).loose() });

  registerOp(registry, 'get', '/checklists', 'Checklists', 'List checklist instances for an entity', {
    200: { description: 'Instances' },
  }, { query: listQuerySchema });

  registerOp(registry, 'post', '/checklists/apply', 'Checklists', 'Apply a template to an entity', {
    201: { description: 'Instance created' },
  }, jsonBody(applyBodySchema));

  registerOp(registry, 'patch', '/checklists/items/{itemId}', 'Checklists', 'Toggle a checklist item done state', {
    200: { description: 'Updated' },
  }, { params: itemIdParam, ...jsonBody(toggleBodySchema) });

  registerOp(registry, 'delete', '/checklists/instances/{instanceId}', 'Checklists', 'Remove a checklist instance', {
    200: { description: 'Deleted' },
  }, { params: instanceIdParam });
}
