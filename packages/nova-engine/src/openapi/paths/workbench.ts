/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { uuidSchema } from '../../domain/schemas';
import { registerOp, uuidParam } from '../helpers';

const queueQuerySchema = z.object({
  bucket: z.enum(['mine', 'unassigned', 'sla', 'major']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});

const resolveQuerySchema = z.object({
  numbers: z.string().optional(),
});

const queueItemSchema = z.object({
  kind: z.enum(['incident', 'major_incident']),
  id: uuidSchema,
  number: z.string(),
  title: z.string(),
  priority: z.number().nullable(),
  status: z.string(),
  sla_due_at: z.string().nullable(),
  sla_breached: z.boolean(),
  vip: z.boolean(),
  assignment_group_name: z.string().nullable(),
  updated_at: z.string(),
});

const resolvedSchema = z.object({
  kind: z.enum(['incident', 'problem', 'change', 'major_incident']),
  id: uuidSchema,
  number: z.string(),
});

export function registerWorkbenchPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/workbench/queue', 'Workbench', 'Compact agent triage queue', {
    200: {
      description: 'Queue rows',
      content: { 'application/json': { schema: z.object({ items: z.array(queueItemSchema) }) } },
    },
  }, { query: queueQuerySchema });

  registerOp(registry, 'get', '/workbench/resolve', 'Workbench', 'Resolve record numbers to ids', {
    200: {
      description: 'Matched records in request order',
      content: { 'application/json': { schema: z.object({ records: z.array(resolvedSchema) }) } },
    },
  }, { query: resolveQuerySchema });

  registerOp(registry, 'get', '/incidents/{id}/emails', 'Incidents', 'List emails linked to an incident', {
    200: { description: 'Email messages' },
    403: { description: 'Insufficient permissions' },
    404: { description: 'Incident not found' },
  }, { params: uuidParam });
}
