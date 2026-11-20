/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { rankedSuggestionsQuerySchema, uuidSchema } from '../../domain/schemas';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const categoryBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  parent_id: uuidSchema.nullable().optional(),
  is_active: z.boolean().optional(),
}).loose();

const categoryCreateBody = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  parent_id: uuidSchema.nullable().optional(),
  is_active: z.boolean().optional(),
}).loose();

const workflowBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  steps: z.unknown().optional(),
}).loose();

const articleCreateBody = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  category_id: uuidSchema.nullable().optional(),
  assignment_group_id: uuidSchema.nullable().optional(),
  meta_data: z.record(z.string(), z.unknown()).optional(),
}).loose();

const articleUpdateBody = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  category_id: uuidSchema.nullable().optional(),
  assignment_group_id: uuidSchema.nullable().optional(),
  status: z.string().optional(),
  meta_data: z.record(z.string(), z.unknown()).optional(),
}).loose();

const decisionBody = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().nullable().optional(),
}).loose();

const rateBody = z.object({
  rating: z.union([z.literal(1), z.literal(-1), z.null()]),
});

const resolutionBody = z.object({
  kb_id: uuidSchema,
}).loose();

const articleListQuery = z.object({
  status: z.string().optional(),
  category_id: uuidSchema.optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().optional(),
}).loose();

const textSuggestionsQuery = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  limit: z.coerce.number().int().optional(),
}).loose();

const incidentIdParam = z.object({ incidentId: uuidSchema });
const articleApprovalParams = z.object({ id: uuidSchema, approvalId: uuidSchema });

export function registerKnowledgePaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/knowledge/categories', 'Knowledge', 'List knowledge categories', {
    200: { description: 'Categories' },
  });
  registerOp(registry, 'post', '/knowledge/categories', 'Knowledge', 'Create knowledge category', {
    201: { description: 'Created' },
    403: { description: 'Admin only' },
  }, jsonBody(categoryCreateBody));
  registerOp(registry, 'patch', '/knowledge/categories/{id}', 'Knowledge', 'Update knowledge category', {
    200: { description: 'Updated' },
    403: { description: 'Admin only' },
  }, { params: uuidParam, ...jsonBody(categoryBody) });
  registerOp(registry, 'delete', '/knowledge/categories/{id}', 'Knowledge', 'Delete knowledge category', {
    200: { description: 'Deleted' },
    403: { description: 'Admin only' },
  }, { params: uuidParam });

  registerOp(registry, 'get', '/knowledge/assignment-groups', 'Knowledge', 'List assignment groups for knowledge', {
    200: { description: 'Assignment groups' },
  });

  registerOp(registry, 'get', '/knowledge/workflows', 'Knowledge', 'List knowledge approval workflows', {
    200: { description: 'Workflows' },
  });
  registerOp(registry, 'post', '/knowledge/workflows', 'Knowledge', 'Create knowledge workflow', {
    201: { description: 'Created' },
    403: { description: 'Insufficient permissions' },
  }, jsonBody(workflowBody));
  registerOp(registry, 'patch', '/knowledge/workflows/{id}', 'Knowledge', 'Update knowledge workflow', {
    200: { description: 'Updated' },
  }, { params: uuidParam, ...jsonBody(workflowBody) });
  registerOp(registry, 'delete', '/knowledge/workflows/{id}', 'Knowledge', 'Delete knowledge workflow', {
    200: { description: 'Deleted' },
  }, { params: uuidParam });

  registerOp(registry, 'get', '/knowledge/articles', 'Knowledge', 'List knowledge articles', {
    200: { description: 'Articles' },
  }, { query: articleListQuery });
  registerOp(registry, 'post', '/knowledge/articles', 'Knowledge', 'Create a draft knowledge article', {
    201: { description: 'Created' },
    403: { description: 'Knowledge role required' },
  }, jsonBody(articleCreateBody));
  registerOp(registry, 'get', '/knowledge/articles/{id}', 'Knowledge', 'Get knowledge article', {
    200: { description: 'Article details' },
    404: { description: 'Not found' },
  }, { params: uuidParam });
  registerOp(registry, 'patch', '/knowledge/articles/{id}', 'Knowledge', 'Update a knowledge article', {
    200: { description: 'Updated' },
    400: { description: 'Published articles are read-only except retire' },
  }, { params: uuidParam, ...jsonBody(articleUpdateBody) });
  registerOp(registry, 'post', '/knowledge/articles/{id}/new-version', 'Knowledge', 'Create a new draft version of an article', {
    201: { description: 'New version created' },
  }, { params: uuidParam });
  registerOp(registry, 'post', '/knowledge/articles/{id}/submit', 'Knowledge', 'Submit article for approval / publish', {
    200: { description: 'Submitted' },
  }, { params: uuidParam });
  registerOp(
    registry,
    'post',
    '/knowledge/articles/{id}/approvals/{approvalId}/decision',
    'Knowledge',
    'Record knowledge approval decision',
    { 200: { description: 'Decision recorded' } },
    { params: articleApprovalParams, ...jsonBody(decisionBody) },
  );
  registerOp(registry, 'get', '/knowledge/articles/{id}/ratings', 'Knowledge', 'Get article rating totals', {
    200: { description: 'thumbs_up / thumbs_down / my_rating' },
  }, { params: uuidParam });
  registerOp(registry, 'post', '/knowledge/articles/{id}/rate', 'Knowledge', 'Rate a knowledge article', {
    200: { description: 'Updated ratings' },
  }, { params: uuidParam, ...jsonBody(rateBody) });

  registerOp(
    registry,
    'get',
    '/knowledge/incidents/{incidentId}/suggestions',
    'Knowledge',
    'Ranked KB suggestions for an incident',
    { 200: { description: 'Suggestions' } },
    { params: incidentIdParam, query: rankedSuggestionsQuerySchema },
  );
  registerOp(
    registry,
    'get',
    '/knowledge/incidents/{incidentId}/resolutions',
    'Knowledge',
    'KB articles linked as resolutions for an incident',
    { 200: { description: 'Resolutions' } },
    { params: incidentIdParam },
  );
  registerOp(
    registry,
    'post',
    '/knowledge/incidents/{incidentId}/resolutions',
    'Knowledge',
    'Link a KB article as an incident resolution',
    { 201: { description: 'Linked' } },
    { params: incidentIdParam, ...jsonBody(resolutionBody) },
  );

  registerOp(registry, 'get', '/knowledge/suggestions-by-text', 'Knowledge', 'Ranked KB suggestions from free text', {
    200: { description: 'Suggestions' },
  }, { query: textSuggestionsQuery });
}
