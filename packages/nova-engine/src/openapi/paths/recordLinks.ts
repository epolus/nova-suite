/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { uuidSchema } from '../../domain/schemas';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const entityTypeSchema = z.enum([
  'incident',
  'request',
  'problem',
  'change',
  'configuration_item',
  'asset',
]);
const linkTypeSchema = z.enum(['related', 'parent', 'duplicate']);

const listQuerySchema = z.object({
  entity_type: entityTypeSchema,
  entity_id: uuidSchema,
});

const searchQuerySchema = z.object({
  entity_type: entityTypeSchema,
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

const createBodySchema = z.object({
  source_type: entityTypeSchema,
  source_id: uuidSchema,
  target_type: entityTypeSchema,
  target_id: uuidSchema,
  link_type: linkTypeSchema.default('related'),
});

export function registerRecordLinkPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/record-links/search', 'Record links', 'Search linkable records', {
    200: { description: 'Candidates' },
  }, { query: searchQuerySchema });

  registerOp(registry, 'get', '/record-links', 'Record links', 'List links for an entity', {
    200: { description: 'Links' },
  }, { query: listQuerySchema });

  registerOp(registry, 'post', '/record-links', 'Record links', 'Create a record link', {
    201: { description: 'Created' },
    403: { description: 'Insufficient permissions' },
  }, jsonBody(createBodySchema));

  registerOp(registry, 'delete', '/record-links/{id}', 'Record links', 'Delete a record link', {
    200: { description: 'Deleted' },
    404: { description: 'Not found' },
  }, { params: uuidParam });
}
