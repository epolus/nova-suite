/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  createMajorIncidentSchema,
  majorIncidentListQuerySchema,
  majorIncidentRelatedSchema,
  majorIncidentResolveSchema,
  majorIncidentRoleSchema,
  majorIncidentStakeholderUpdateSchema,
  postmortemActionItemCreateSchema,
  postmortemFollowUpSchema,
  postmortemUpsertSchema,
  publishPostmortemSchema,
  updateMajorIncidentSchema,
  uuidSchema,
} from '../../domain/schemas';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const actionItemParams = z.object({ id: uuidSchema, actionItemId: uuidSchema });

export function registerMajorIncidentPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/major-incidents/active-banner', 'Major incidents', 'Active major-incident banner', {
    200: { description: 'Banner payload or empty' },
  });

  registerOp(registry, 'get', '/major-incidents', 'Major incidents', 'List major incidents', {
    200: { description: 'Paginated major incidents' },
  }, { query: majorIncidentListQuerySchema });

  registerOp(registry, 'post', '/major-incidents', 'Major incidents', 'Create a major incident', {
    201: { description: 'Major incident created' },
  }, jsonBody(createMajorIncidentSchema));

  registerOp(registry, 'get', '/major-incidents/{id}', 'Major incidents', 'Get major incident details', {
    200: { description: 'Major incident details' },
    404: { description: 'Not found' },
  }, { params: uuidParam });

  registerOp(registry, 'patch', '/major-incidents/{id}', 'Major incidents', 'Update a major incident', {
    200: { description: 'Updated' },
  }, { params: uuidParam, ...jsonBody(updateMajorIncidentSchema) });

  registerOp(registry, 'post', '/major-incidents/{id}/accept-major', 'Major incidents', 'Accept promoted major incident', {
    200: { description: 'Accepted' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/major-incidents/{id}/reject-promotion', 'Major incidents', 'Reject major-incident promotion', {
    200: { description: 'Rejected' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/major-incidents/{id}/stakeholder-updates', 'Major incidents', 'Post stakeholder update', {
    201: { description: 'Update posted' },
  }, { params: uuidParam, ...jsonBody(majorIncidentStakeholderUpdateSchema) });

  registerOp(registry, 'post', '/major-incidents/{id}/roles', 'Major incidents', 'Assign major-incident role', {
    201: { description: 'Role assigned' },
  }, { params: uuidParam, ...jsonBody(majorIncidentRoleSchema) });

  registerOp(registry, 'post', '/major-incidents/{id}/investigate', 'Major incidents', 'Mark investigating', {
    200: { description: 'Status updated' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/major-incidents/{id}/resolve', 'Major incidents', 'Resolve major incident', {
    200: { description: 'Resolved' },
  }, { params: uuidParam, ...jsonBody(majorIncidentResolveSchema) });

  registerOp(registry, 'post', '/major-incidents/{id}/related-incidents', 'Major incidents', 'Link related incident', {
    201: { description: 'Linked' },
  }, { params: uuidParam, ...jsonBody(majorIncidentRelatedSchema) });

  registerOp(registry, 'get', '/major-incidents/{id}/suggested-related', 'Major incidents', 'Suggested related incidents', {
    200: { description: 'Suggestions' },
  }, { params: uuidParam });

  registerOp(registry, 'get', '/major-incidents/{id}/postmortem', 'Major incidents', 'Get postmortem', {
    200: { description: 'Postmortem' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/major-incidents/{id}/postmortem', 'Major incidents', 'Create postmortem', {
    201: { description: 'Postmortem created' },
  }, { params: uuidParam, ...jsonBody(postmortemUpsertSchema) });

  registerOp(registry, 'patch', '/major-incidents/{id}/postmortem', 'Major incidents', 'Update postmortem', {
    200: { description: 'Postmortem updated' },
  }, { params: uuidParam, ...jsonBody(postmortemUpsertSchema) });

  registerOp(registry, 'post', '/major-incidents/{id}/postmortem/publish', 'Major incidents', 'Publish postmortem', {
    200: { description: 'Published' },
  }, { params: uuidParam, ...jsonBody(publishPostmortemSchema) });

  registerOp(registry, 'post', '/major-incidents/{id}/postmortem/action-items', 'Major incidents', 'Add postmortem action item', {
    201: { description: 'Action item created' },
  }, { params: uuidParam, ...jsonBody(postmortemActionItemCreateSchema) });

  registerOp(
    registry,
    'post',
    '/major-incidents/{id}/postmortem/action-items/{actionItemId}/follow-up',
    'Major incidents',
    'Create follow-up from action item',
    { 201: { description: 'Follow-up created' } },
    { params: actionItemParams, ...jsonBody(postmortemFollowUpSchema) },
  );
}
