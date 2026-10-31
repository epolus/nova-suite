/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { createAssetSchema, paginationSchema, updateAssetSchema } from '../../domain/schemas';
import { jsonBody, registerOp, uuidParam } from '../helpers';

export function registerAssetPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/assets', 'Assets', 'List assets', {
    200: { description: 'Paginated assets' },
  }, { query: paginationSchema });

  registerOp(registry, 'post', '/assets', 'Assets', 'Create an asset', {
    201: { description: 'Asset created' },
    403: { description: 'Insufficient permissions' },
  }, jsonBody(createAssetSchema));

  registerOp(registry, 'get', '/assets/{id}', 'Assets', 'Get asset details', {
    200: { description: 'Asset details' },
    404: { description: 'Not found' },
  }, { params: uuidParam });

  registerOp(registry, 'patch', '/assets/{id}', 'Assets', 'Update an asset', {
    200: { description: 'Asset updated' },
    403: { description: 'Insufficient permissions' },
  }, { params: uuidParam, ...jsonBody(updateAssetSchema) });
}
