/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { paginationSchema, uuidSchema } from '../../domain/schemas';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const alertListQuery = paginationSchema.merge(
  z.object({
    status: z.enum(['firing', 'resolved', 'all']).optional(),
    search: z.string().optional(),
    sort_by: z.string().optional(),
    sort_dir: z.enum(['asc', 'desc']).optional(),
  }).partial(),
).loose();

const alertDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  source: z.string().nullable().optional(),
  severity: z.string().nullable().optional(),
  match_labels: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  severity_map: z.record(z.string(), z.union([z.string(), z.number()])).nullable().optional(),
  action: z.enum(['none', 'incident', 'workflow']).optional(),
  assignment_group_id: uuidSchema.nullable().optional(),
  impact: z.enum(['low', 'medium', 'high']).nullable().optional(),
  urgency: z.enum(['low', 'medium', 'high']).nullable().optional(),
}).loose();

export function registerAlertPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/alerts', 'Alerts', 'List alerts', {
    200: { description: 'Paginated alerts' },
  }, { query: alertListQuery });

  registerOp(registry, 'get', '/alerts/assignment-groups', 'Alerts', 'List assignment groups for alert definitions', {
    200: { description: 'Assignment groups' },
  });

  registerOp(registry, 'get', '/alerts/definitions', 'Alerts', 'List alert definitions', {
    200: { description: 'Alert definitions' },
  });

  registerOp(registry, 'post', '/alerts/definitions', 'Alerts', 'Create alert definition', {
    201: { description: 'Definition created' },
  }, jsonBody(alertDefinitionSchema));

  registerOp(registry, 'patch', '/alerts/definitions/{id}', 'Alerts', 'Update alert definition', {
    200: { description: 'Definition updated' },
  }, { params: uuidParam, ...jsonBody(alertDefinitionSchema.partial()) });

  registerOp(registry, 'get', '/alerts/{id}', 'Alerts', 'Get alert details', {
    200: { description: 'Alert details' },
    404: { description: 'Not found' },
  }, { params: uuidParam });
}
