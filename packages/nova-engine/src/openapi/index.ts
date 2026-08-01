/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – OpenAPI document (generated from Zod via registerPaths) ───

import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import type { OpenAPIObject } from 'openapi3-ts/oas30';
import { registerApiPaths } from './registerPaths';

const registry = new OpenAPIRegistry();
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});
registerApiPaths(registry);

const generator = new OpenApiGeneratorV3(registry.definitions);

export const openApiSpec: OpenAPIObject = generator.generateDocument({
  openapi: '3.0.3',
  info: {
    title: 'Nova Suite API',
    version: '1.0.0',
    description:
      'Open-source ITSM Suite – Service catalog, incident management and CMDB. ' +
      'Paths and request bodies are generated from the same Zod schemas used by the API. ' +
      'Undocumented routes still exist; add them in src/openapi/registerPaths.ts.',
    license: { name: 'AGPL-3.0', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
  },
  servers: [{ url: '/api', description: 'API base' }],
  tags: [
    { name: 'Auth', description: 'Authentication & user management' },
    { name: 'Catalog', description: 'Service catalog – categories & items' },
    { name: 'Requests', description: 'User portal – service requests' },
    { name: 'Incidents', description: 'Fulfiller backend – incident lifecycle' },
    { name: 'CMDB', description: 'Configuration management database' },
    { name: 'Config packages', description: 'Admin – catalog & notification bundles' },
  ],
  security: [{ bearerAuth: [] }],
});
