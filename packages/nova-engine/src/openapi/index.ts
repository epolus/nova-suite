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
    version: '0.1.5',
    description:
      'Nova Suite is an open-source ITSM platform for internal IT teams, MSPs, and small enterprises. ' +
      'It covers service catalog & requests, incident/problem/change management, CMDB & assets, alerts, ' +
      'major incidents, configuration packages, and Temporal-backed automation. ' +
      'Authentication is JWT with optional OIDC/SSO. ' +
      'Paths and request bodies are generated from the same Zod schemas used by the API where available. ' +
      'A few internal automation stubs may remain undocumented; add them in src/openapi/registerPaths.ts or src/openapi/paths/.',
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
    { name: 'Knowledge', description: 'Knowledge base categories, workflows, articles & ratings' },
    { name: 'Releases', description: 'Release management' },
    { name: 'Improvements', description: 'Continual improvement records and journal' },
    { name: 'Notifications', description: 'In-app notification inbox' },
    { name: 'Search', description: 'Global fuzzy search' },
    { name: 'Approvals', description: 'Pending approvals for the current user' },
    { name: 'Settings', description: 'Tenant branding, theme, and cache metrics' },
    { name: 'Attachments', description: 'Entity file attachments' },
    { name: 'Work logs', description: 'Time worked against ITSM entities' },
    { name: 'Inbound email', description: 'IMAP mailboxes, rules, and ingest history' },
    { name: 'Credentials', description: 'Encrypted integration credential vault' },
    { name: 'Data sources', description: 'Scheduled / on-demand external data imports' },
    { name: 'Data management', description: 'Bulk archive/delete jobs with preview' },
    { name: 'Import', description: 'Spreadsheet/CSV import jobs' },
    { name: 'Rota', description: 'On-call shifts and coverage' },
    { name: 'Checklists', description: 'Checklist templates and instance items' },
    { name: 'Cart', description: 'Service catalog shopping cart' },
    { name: 'Dashboards', description: 'User dashboard layouts' },
    { name: 'CSAT', description: 'Customer satisfaction surveys' },
    { name: 'Record links', description: 'Cross-record relationships' },
    { name: 'Custom fields', description: 'Custom field definitions and values' },
    { name: 'AI', description: 'AI assistant conversations and actions' },
    { name: 'Analytics', description: 'Trend metrics catalog and series' },
    { name: 'Reports', description: 'Saved reports, preview, run, and exports' },
    { name: 'Email templates', description: 'Email templates and user signatures' },
    { name: 'Webhooks', description: 'Public inbound webhooks (secret-authenticated)' },
    { name: 'Admin', description: 'Tenant administration (users, org, SLA, workflows, …)' },
    { name: 'Temporal', description: 'Background workflow inspection (admin)' },
    { name: 'Config packages', description: 'Admin – catalog & notification bundles' },
    { name: 'ServiceNow migration', description: 'ServiceNow extract, transform & apply' },
  ],
  security: [{ bearerAuth: [] }],
});
