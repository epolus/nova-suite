/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { uuidSchema } from '../../domain/schemas';
import { registerOp } from '../helpers';

const entityTypeParam = z.object({
  entityType: z.enum(['incident', 'change', 'asset']),
});

const valuesParams = z.object({
  entityType: z.enum(['incident', 'change', 'asset']),
  entityId: uuidSchema,
});

export function registerCustomFieldPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/custom-fields/{entityType}', 'Custom fields', 'List custom field definitions for an entity type', {
    200: { description: 'Definitions' },
  }, {
    params: entityTypeParam,
    query: z.object({ include_inactive: z.string().optional() }).loose(),
  });

  registerOp(
    registry,
    'get',
    '/custom-fields/{entityType}/{entityId}/values',
    'Custom fields',
    'Get custom field values for a record',
    { 200: { description: 'Values' } },
    { params: valuesParams },
  );
}
