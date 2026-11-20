/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const createCredentialBody = z.object({
  slug: z.string().min(1),
  label: z.string().min(1),
  description: z.string().nullable().optional(),
  secret: z.string().optional(),
  kind: z.string().optional(),
  oauth2: z.record(z.string(), z.unknown()).optional(),
}).loose();

const updateCredentialBody = z.object({
  label: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  secret: z.string().optional(),
  oauth2: z.record(z.string(), z.unknown()).optional(),
}).loose();

export function registerCredentialPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/credentials', 'Credentials', 'List tenant credentials (metadata only)', {
    200: { description: 'Credential list' },
    403: { description: 'Insufficient permissions' },
  });

  registerOp(registry, 'post', '/credentials', 'Credentials', 'Create a credential', {
    201: { description: 'Created' },
    403: { description: 'Insufficient permissions' },
    503: { description: 'CREDENTIALS_MASTER_KEY missing' },
  }, jsonBody(createCredentialBody));

  registerOp(registry, 'get', '/credentials/{id}', 'Credentials', 'Get credential metadata', {
    200: { description: 'Credential' },
    404: { description: 'Not found' },
  }, { params: uuidParam });

  registerOp(registry, 'put', '/credentials/{id}', 'Credentials', 'Update / rotate a credential', {
    200: { description: 'Updated' },
    404: { description: 'Not found' },
  }, { params: uuidParam, ...jsonBody(updateCredentialBody) });

  registerOp(registry, 'post', '/credentials/{id}/test-token', 'Credentials', 'Test OAuth2 client-credentials token fetch', {
    200: { description: 'Token probe result' },
    400: { description: 'Not an OAuth credential' },
    404: { description: 'Not found' },
  }, { params: uuidParam });

  registerOp(registry, 'delete', '/credentials/{id}', 'Credentials', 'Delete a credential', {
    200: { description: 'Deleted' },
    404: { description: 'Not found' },
  }, { params: uuidParam });
}
