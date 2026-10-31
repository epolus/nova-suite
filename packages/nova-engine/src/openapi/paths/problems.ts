/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { createProblemSchema, paginationSchema, updateProblemSchema, uuidSchema } from '../../domain/schemas';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const taskParams = z.object({ id: uuidSchema, taskId: uuidSchema });
const knownErrorParams = z.object({ id: uuidSchema, knownErrorId: uuidSchema });
const incidentLinkParams = z.object({ id: uuidSchema, incidentId: uuidSchema });

const problemTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional().nullable(),
  assigned_to: uuidSchema.optional().nullable(),
  assignment_group_id: uuidSchema.optional().nullable(),
  status: z.string().optional(),
}).loose();

const knownErrorSchema = z.object({
  title: z.string().min(1).max(500),
  workaround: z.string().max(10000).optional().nullable(),
  root_cause: z.string().max(10000).optional().nullable(),
  is_active: z.boolean().optional(),
}).loose();

const linkIncidentSchema = z.object({
  incident_id: uuidSchema,
});

const fromRecurringSchema = z.object({
  incident_ids: z.array(uuidSchema).min(2).optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
}).loose();

export function registerProblemPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/problems/assignment-groups', 'Problems', 'List assignment groups for problems', {
    200: { description: 'Assignment groups' },
  });

  registerOp(registry, 'get', '/problems/incidents/search', 'Problems', 'Search incidents to link', {
    200: { description: 'Matching incidents' },
  });

  registerOp(registry, 'get', '/problems/incidents/recurrence-candidates', 'Problems', 'Recurring incident candidates', {
    200: { description: 'Candidate clusters' },
  });

  registerOp(registry, 'post', '/problems/from-recurring-incidents', 'Problems', 'Create problem from recurring incidents', {
    201: { description: 'Problem created' },
    403: { description: 'Insufficient permissions' },
  }, jsonBody(fromRecurringSchema));

  registerOp(registry, 'get', '/problems', 'Problems', 'List problems', {
    200: { description: 'Paginated problems' },
  }, { query: paginationSchema });

  registerOp(registry, 'get', '/problems/nav', 'Problems', 'Problem list prev/next navigation', {
    200: { description: 'Adjacent problem ids' },
  });

  registerOp(registry, 'get', '/problems/by-ci/{ciId}', 'Problems', 'Problems linked to a CI', {
    200: { description: 'Problems for CI' },
  }, { params: z.object({ ciId: uuidSchema }) });

  registerOp(registry, 'post', '/problems', 'Problems', 'Create a problem', {
    201: { description: 'Problem created' },
    403: { description: 'Insufficient permissions' },
  }, jsonBody(createProblemSchema));

  registerOp(registry, 'get', '/problems/{id}', 'Problems', 'Get problem details', {
    200: { description: 'Problem details' },
    404: { description: 'Not found' },
  }, { params: uuidParam });

  registerOp(registry, 'patch', '/problems/{id}', 'Problems', 'Update a problem', {
    200: { description: 'Problem updated' },
  }, { params: uuidParam, ...jsonBody(updateProblemSchema) });

  registerOp(registry, 'get', '/problems/{id}/incidents', 'Problems', 'List linked incidents', {
    200: { description: 'Linked incidents' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/problems/{id}/incidents', 'Problems', 'Link an incident', {
    201: { description: 'Linked' },
  }, { params: uuidParam, ...jsonBody(linkIncidentSchema) });

  registerOp(registry, 'delete', '/problems/{id}/incidents/{incidentId}', 'Problems', 'Unlink an incident', {
    200: { description: 'Unlinked' },
  }, { params: incidentLinkParams });

  registerOp(registry, 'get', '/problems/{id}/tasks', 'Problems', 'List problem tasks', {
    200: { description: 'Tasks' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/problems/{id}/tasks', 'Problems', 'Create problem task', {
    201: { description: 'Task created' },
  }, { params: uuidParam, ...jsonBody(problemTaskSchema) });

  registerOp(registry, 'patch', '/problems/{id}/tasks/{taskId}', 'Problems', 'Update problem task', {
    200: { description: 'Task updated' },
  }, { params: taskParams, ...jsonBody(problemTaskSchema.partial()) });

  registerOp(registry, 'delete', '/problems/{id}/tasks/{taskId}', 'Problems', 'Delete problem task', {
    200: { description: 'Task deleted' },
  }, { params: taskParams });

  registerOp(registry, 'get', '/problems/{id}/known-errors', 'Problems', 'List known errors', {
    200: { description: 'Known errors' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/problems/{id}/known-errors', 'Problems', 'Create known error', {
    201: { description: 'Known error created' },
  }, { params: uuidParam, ...jsonBody(knownErrorSchema) });

  registerOp(registry, 'patch', '/problems/{id}/known-errors/{knownErrorId}', 'Problems', 'Update known error', {
    200: { description: 'Known error updated' },
  }, { params: knownErrorParams, ...jsonBody(knownErrorSchema.partial()) });

  registerOp(registry, 'post', '/problems/{id}/known-errors/{knownErrorId}/kb-article', 'Problems', 'Publish known error to knowledge', {
    201: { description: 'KB article created/linked' },
  }, { params: knownErrorParams });

  registerOp(registry, 'delete', '/problems/{id}/known-errors/{knownErrorId}/kb-article', 'Problems', 'Unlink knowledge article', {
    200: { description: 'Unlinked' },
  }, { params: knownErrorParams });
}
