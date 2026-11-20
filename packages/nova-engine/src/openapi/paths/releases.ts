/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { createReleaseSchema, updateReleaseSchema } from '../../domain/schemas';
import { jsonBody, registerOp, uuidParam } from '../helpers';

export function registerReleasePaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/releases', 'Releases', 'List releases', {
    200: { description: 'Release list' },
  });

  registerOp(registry, 'post', '/releases', 'Releases', 'Create a release', {
    201: { description: 'Release created' },
  }, jsonBody(createReleaseSchema));

  registerOp(registry, 'get', '/releases/{id}', 'Releases', 'Get release details', {
    200: { description: 'Release details' },
    404: { description: 'Not found' },
  }, { params: uuidParam });

  registerOp(registry, 'patch', '/releases/{id}', 'Releases', 'Update a release', {
    200: { description: 'Release updated' },
    404: { description: 'Not found' },
  }, { params: uuidParam, ...jsonBody(updateReleaseSchema) });
}
