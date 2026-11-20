/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { uuidSchema } from '../../domain/schemas';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const entityTypeSchema = z.enum(['incident', 'request_task', 'problem_task', 'change']);

const listQuerySchema = z.object({
  entity_type: entityTypeSchema,
  entity_id: uuidSchema,
});

const createBodySchema = z.object({
  entity_type: entityTypeSchema,
  entity_id: uuidSchema,
  minutes: z.coerce.number().int().min(1).max(24 * 60),
  worked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(5000).nullable().optional(),
  is_customer_visible: z.boolean().optional(),
});

const updateBodySchema = z.object({
  minutes: z.coerce.number().int().min(1).max(24 * 60).optional(),
  worked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(5000).nullable().optional(),
  is_customer_visible: z.boolean().optional(),
});

export function registerWorkLogPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/work-logs', 'Work logs', 'List work logs for an entity', {
    200: { description: 'Work logs + total minutes' },
  }, { query: listQuerySchema });

  registerOp(registry, 'post', '/work-logs', 'Work logs', 'Create a work log entry', {
    201: { description: 'Work log created' },
    403: { description: 'Insufficient permissions' },
  }, jsonBody(createBodySchema));

  registerOp(registry, 'patch', '/work-logs/{id}', 'Work logs', 'Update a work log entry', {
    200: { description: 'Work log updated' },
    403: { description: 'Insufficient permissions' },
    404: { description: 'Not found' },
  }, { params: uuidParam, ...jsonBody(updateBodySchema) });

  registerOp(registry, 'delete', '/work-logs/{id}', 'Work logs', 'Delete a work log entry', {
    200: { description: 'Deleted' },
    403: { description: 'Insufficient permissions' },
    404: { description: 'Not found' },
  }, { params: uuidParam });
}
