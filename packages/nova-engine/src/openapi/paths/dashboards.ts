/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const widgetInstanceSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.string(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
});

const layoutSchema = z.object({
  version: z.literal(1),
  widgets: z.array(widgetInstanceSchema),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  layout: layoutSchema.optional(),
  is_default: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  layout: layoutSchema.optional(),
  is_default: z.boolean().optional(),
});

export function registerDashboardPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/dashboards', 'Dashboards', 'List dashboards for the current user', {
    200: { description: 'Dashboards' },
  });

  registerOp(registry, 'post', '/dashboards', 'Dashboards', 'Create a dashboard', {
    201: { description: 'Created' },
  }, jsonBody(createSchema));

  registerOp(registry, 'patch', '/dashboards/{id}', 'Dashboards', 'Update a dashboard', {
    200: { description: 'Updated' },
    404: { description: 'Not found' },
  }, { params: uuidParam, ...jsonBody(updateSchema) });

  registerOp(registry, 'delete', '/dashboards/{id}', 'Dashboards', 'Delete a dashboard', {
    200: { description: 'Deleted' },
    404: { description: 'Not found' },
  }, { params: uuidParam });
}
