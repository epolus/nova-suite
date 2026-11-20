/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { uuidSchema } from '../../domain/schemas';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const listQuerySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  assignment_group_id: uuidSchema.optional(),
});

const createBodySchema = z.object({
  assignment_group_id: uuidSchema,
  user_id: uuidSchema,
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  notes: z.string().max(5000).nullable().optional(),
});

const onCallQuerySchema = z.object({
  assignment_group_id: uuidSchema,
  at: z.string().optional(),
});

export function registerRotaPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/rota/business-calendars', 'Rota', 'List business calendars for on-call display', {
    200: { description: 'Calendars with hours and holidays' },
    403: { description: 'Insufficient permissions' },
  });

  registerOp(registry, 'get', '/rota/shifts', 'Rota', 'List on-call shifts in a date range', {
    200: { description: 'Shifts' },
  }, { query: listQuerySchema });

  registerOp(registry, 'get', '/rota/on-call', 'Rota', 'Resolve who is on call for a group', {
    200: { description: 'On-call user (or null)' },
  }, { query: onCallQuerySchema });

  registerOp(registry, 'post', '/rota/shifts', 'Rota', 'Create an on-call shift', {
    201: { description: 'Created' },
    403: { description: 'Admin / on_call_admin' },
  }, jsonBody(createBodySchema));

  registerOp(registry, 'patch', '/rota/shifts/{id}', 'Rota', 'Update an on-call shift', {
    200: { description: 'Updated' },
    404: { description: 'Not found' },
  }, { params: uuidParam, ...jsonBody(createBodySchema.partial()) });

  registerOp(registry, 'delete', '/rota/shifts/{id}', 'Rota', 'Delete an on-call shift', {
    200: { description: 'Deleted' },
    404: { description: 'Not found' },
  }, { params: uuidParam });
}
