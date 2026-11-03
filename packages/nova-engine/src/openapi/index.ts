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
    version: '0.1.4',
    description:
      'Nova Suite is an open-source ITSM platform for internal IT teams, MSPs, and small enterprises. ' +
      'It covers service catalog & requests, incident/problem/change management, CMDB & assets, alerts, ' +
      'major incidents, configuration packages, and Temporal-backed automation. ' +
      'Authentication is JWT with optional OIDC/SSO. ' +
      'Paths and request bodies are generated from the same Zod schemas used by the API where available. ' +
      'Some admin/analytics/import routes remain undocumented; add them in src/openapi/registerPaths.ts or src/openapi/paths/.',
    license: { name: 'AGPL-3.0', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
  },
  servers: [{ url: '/api', description: 'API base' }],
  tags: [
    { name: 'Auth', description: 'JWT authentication, user preferences, and OIDC/SSO' },
    { name: 'Catalog', description: 'Service catalog – categories, items & fulfillment tasks' },
    { name: 'Requests', description: 'User portal – service requests & task fulfillment' },
    { name: 'Incidents', description: 'Incident lifecycle, correlations & AI suggestions' },
    { name: 'Problems', description: 'Problem management, known errors & recurrence' },
    { name: 'Changes', description: 'Change lifecycle, CAB, risk & blackouts' },
    { name: 'Major incidents', description: 'Major incident command, comms & postmortems' },
    { name: 'CMDB', description: 'Configuration management database' },
    { name: 'Assets', description: 'IT asset inventory linked to CMDB' },
    { name: 'Alerts', description: 'Event/alert inbox and routing definitions' },
    { name: 'Temporal', description: 'Background workflow inspection (admin)' },
    { name: 'Config packages', description: 'Admin – catalog & notification bundles' },
    { name: 'ServiceNow migration', description: 'ServiceNow extract, transform & apply' },
  ],
  security: [{ bearerAuth: [] }],
});
