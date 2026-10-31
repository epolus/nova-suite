/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  batchRequestSchema,
  createServiceItemSchema,
  incidentLinkMajorIncidentSchema,
  paginationSchema,
  rankedSuggestionsQuerySchema,
  uuidSchema,
} from '../../domain/schemas';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const updateServiceItemSchema = createServiceItemSchema.partial().extend({
  is_active: z.boolean().optional(),
});

const catalogTaskSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional().nullable(),
  assignment_group_id: uuidSchema.optional().nullable(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

const catalogTaskParams = z.object({ id: uuidSchema, taskId: uuidSchema });
const requestTaskParams = z.object({ id: uuidSchema, taskId: uuidSchema });
const problemLinkParams = z.object({ id: uuidSchema, problemId: uuidSchema });

const assignTaskSchema = z.object({
  assigned_to: uuidSchema.nullable().optional(),
  assignment_group_id: uuidSchema.nullable().optional(),
});

const completeTaskSchema = z.object({
  work_notes: z.string().max(10000).optional(),
}).loose();

const incidentBulkSchema = z.object({
  ids: z.array(uuidSchema).min(1),
  status: z.string().optional(),
  assigned_to: uuidSchema.nullable().optional(),
  assignment_group_id: uuidSchema.nullable().optional(),
  priority: z.coerce.number().int().optional(),
}).loose();

export function registerCoreGaps(registry: OpenAPIRegistry): void {
  // ─── Catalog gaps ───
  registerOp(registry, 'get', '/catalog/locations', 'Catalog', 'List catalog locations', {
    200: { description: 'Locations' },
  });

  registerOp(registry, 'put', '/catalog/items/{id}', 'Catalog', 'Update service item (admin)', {
    200: { description: 'Item updated' },
    404: { description: 'Not found' },
  }, { params: uuidParam, ...jsonBody(updateServiceItemSchema) });

  registerOp(registry, 'delete', '/catalog/items/{id}', 'Catalog', 'Deactivate or permanently delete item', {
    200: { description: 'Item removed' },
    404: { description: 'Not found' },
  }, {
    params: uuidParam,
    query: z.object({ permanent: z.enum(['true', 'false']).optional() }).loose(),
  });

  registerOp(registry, 'get', '/catalog/items/{id}/picture', 'Catalog', 'Get service item picture', {
    200: { description: 'Image bytes' },
    404: { description: 'Not found' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/catalog/items/{id}/picture', 'Catalog', 'Upload service item picture', {
    200: { description: 'Picture uploaded' },
  }, { params: uuidParam });

  registerOp(registry, 'delete', '/catalog/items/{id}/picture', 'Catalog', 'Remove service item picture', {
    200: { description: 'Picture removed' },
  }, { params: uuidParam });

  registerOp(registry, 'get', '/catalog/tasks', 'Catalog', 'List catalog fulfillment tasks', {
    200: { description: 'Tasks' },
  });

  registerOp(registry, 'get', '/catalog/items/{id}/tasks', 'Catalog', 'List tasks for a service item', {
    200: { description: 'Item tasks' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/catalog/items/{id}/tasks', 'Catalog', 'Create catalog task', {
    201: { description: 'Task created' },
  }, { params: uuidParam, ...jsonBody(catalogTaskSchema) });

  registerOp(registry, 'put', '/catalog/items/{id}/tasks/{taskId}', 'Catalog', 'Update catalog task', {
    200: { description: 'Task updated' },
  }, { params: catalogTaskParams, ...jsonBody(catalogTaskSchema.partial()) });

  registerOp(registry, 'delete', '/catalog/items/{id}/tasks/{taskId}', 'Catalog', 'Delete catalog task', {
    200: { description: 'Task deleted' },
  }, { params: catalogTaskParams });

  // ─── Requests gaps ───
  registerOp(registry, 'get', '/requests/nav', 'Requests', 'Request list prev/next navigation', {
    200: { description: 'Adjacent request ids' },
  });

  registerOp(registry, 'post', '/requests/batch', 'Requests', 'Submit multiple service requests', {
    201: { description: 'Batch created' },
  }, jsonBody(batchRequestSchema));

  registerOp(registry, 'get', '/requests/tasks', 'Requests', 'List fulfillment tasks across requests', {
    200: { description: 'Paginated tasks' },
  }, { query: paginationSchema });

  registerOp(registry, 'get', '/requests/tasks/{taskId}', 'Requests', 'Get a request task', {
    200: { description: 'Task details' },
    404: { description: 'Not found' },
  }, { params: z.object({ taskId: uuidSchema }) });

  registerOp(registry, 'get', '/requests/{id}/tasks', 'Requests', 'List tasks for a request', {
    200: { description: 'Request tasks' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/requests/{id}/tasks/{taskId}/complete', 'Requests', 'Complete a request task', {
    200: { description: 'Task completed' },
  }, { params: requestTaskParams, ...jsonBody(completeTaskSchema) });

  registerOp(registry, 'post', '/requests/{id}/tasks/{taskId}/assign', 'Requests', 'Assign a request task', {
    200: { description: 'Task assigned' },
  }, { params: requestTaskParams, ...jsonBody(assignTaskSchema) });

  // ─── Incidents gaps ───
  registerOp(registry, 'get', '/incidents/services', 'Incidents', 'List services for incident forms', {
    200: { description: 'Services' },
  });

  registerOp(registry, 'get', '/incidents/callers', 'Incidents', 'List callers for incident forms', {
    200: { description: 'Callers' },
  });

  registerOp(registry, 'get', '/incidents/stats', 'Incidents', 'Incident dashboard stats', {
    200: { description: 'Counts by status/priority' },
  });

  registerOp(registry, 'get', '/incidents/assignment-groups', 'Incidents', 'List assignment groups', {
    200: { description: 'Assignment groups' },
  });

  registerOp(registry, 'get', '/incidents/nav', 'Incidents', 'Incident list prev/next navigation', {
    200: { description: 'Adjacent incident ids' },
  });

  registerOp(registry, 'post', '/incidents/ess', 'Incidents', 'Create ESS (self-service) incident', {
    201: { description: 'Incident created' },
  });

  registerOp(registry, 'patch', '/incidents/bulk', 'Incidents', 'Bulk-update incidents', {
    200: { description: 'Bulk update result' },
  }, jsonBody(incidentBulkSchema));

  registerOp(registry, 'get', '/incidents/similar-by-text', 'Incidents', 'Find similar incidents by free text', {
    200: { description: 'Ranked similar incidents' },
  });

  registerOp(registry, 'get', '/incidents/by-ci/{ciId}', 'Incidents', 'List incidents linked to a CI', {
    200: { description: 'Incidents for CI' },
  }, { params: z.object({ ciId: uuidSchema }) });

  registerOp(registry, 'get', '/incidents/known-errors-by-context', 'Incidents', 'Known errors matching context', {
    200: { description: 'Known errors' },
  });

  registerOp(registry, 'get', '/incidents/{id}/similar', 'Incidents', 'Similar incidents for an incident', {
    200: { description: 'Ranked suggestions' },
  }, { params: uuidParam, query: rankedSuggestionsQuerySchema });

  registerOp(registry, 'get', '/incidents/{id}/correlations', 'Incidents', 'Alert/event correlations', {
    200: { description: 'Correlated alerts' },
  }, { params: uuidParam });

  registerOp(registry, 'get', '/incidents/{id}/known-errors', 'Incidents', 'Known errors for an incident', {
    200: { description: 'Known errors' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/incidents/{id}/link-major-incident', 'Incidents', 'Link incident to a major incident', {
    200: { description: 'Linked' },
  }, { params: uuidParam, ...jsonBody(incidentLinkMajorIncidentSchema) });

  registerOp(registry, 'get', '/incidents/{id}/ai-suggestions', 'Incidents', 'List AI triage suggestions', {
    200: { description: 'Suggestions' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/incidents/{id}/ai-suggestions/{suggestionId}/accept', 'Incidents', 'Accept AI suggestion', {
    200: { description: 'Accepted' },
  }, { params: z.object({ id: uuidSchema, suggestionId: uuidSchema }) });

  registerOp(registry, 'post', '/incidents/{id}/ai-suggestions/{suggestionId}/reject', 'Incidents', 'Reject AI suggestion', {
    200: { description: 'Rejected' },
  }, { params: z.object({ id: uuidSchema, suggestionId: uuidSchema }) });

  registerOp(registry, 'get', '/incidents/{id}/problems', 'Incidents', 'Problems linked to an incident', {
    200: { description: 'Linked problems' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/incidents/{id}/problems', 'Incidents', 'Link a problem to an incident', {
    201: { description: 'Linked' },
  }, { params: uuidParam, ...jsonBody(z.object({ problem_id: uuidSchema })) });

  registerOp(registry, 'delete', '/incidents/{id}/problems/{problemId}', 'Incidents', 'Unlink a problem from an incident', {
    200: { description: 'Unlinked' },
  }, { params: problemLinkParams });
}
