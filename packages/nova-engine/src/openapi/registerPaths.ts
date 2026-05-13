/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── OpenAPI path registration (Zod → OpenAPI) ───
// Add new operations here when you add routes so /docs stays aligned with validateBody/validateQuery schemas.

import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  addJournalEntrySchema,
  approveRequestSchema,
  configPackageApplySchema,
  createCategorySchema,
  createCIClassSchema,
  createCIRelationshipSchema,
  createCISchema,
  createIncidentSchema,
  createRequestSchema,
  createServiceItemSchema,
  loginSchema,
  paginationSchema,
  registerSchema,
  updateCIClassSchema,
  updateCISchema,
  updateIncidentSchema,
} from '../domain/schemas';

const uuidParam = z.object({ id: z.string().uuid() });

const catalogItemsQuerySchema = z
  .object({
    category_id: z.string().uuid().optional(),
    include_inactive: z.enum(['true']).optional(),
  })
  .passthrough();

const incidentListQuerySchema = paginationSchema.merge(
  z
    .object({
      status: z.string().optional(),
      assigned_to: z.string().uuid().optional(),
      priority: z.coerce.number().int().optional(),
      sla_breached: z.enum(['true', 'false']).optional(),
      assigned_to_me: z.enum(['true', 'false']).optional(),
      my_groups: z.enum(['true', 'false']).optional(),
    })
    .partial(),
);

const cmdbItemsQuerySchema = paginationSchema.merge(
  z
    .object({
      class_id: z.string().uuid().optional(),
      class: z.string().optional(),
      managed_by: z.string().optional(),
      status: z.string().optional(),
      environment: z.string().optional(),
      search: z.string().optional(),
      context: z.enum(['picker']).optional(),
    })
    .partial(),
);

const cmdbItemsNavQuerySchema = z
  .object({
    current: z.string().uuid().optional(),
    class_id: z.string().uuid().optional(),
    status: z.string().optional(),
    environment: z.string().optional(),
    search: z.string().optional(),
  })
  .passthrough();

const cmdbImpactQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(50).default(5).optional(),
});

const configPackageRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export function registerApiPaths(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'post',
    path: '/auth/login',
    tags: ['Auth'],
    summary: 'Login',
    description: 'Authenticate with email and password, receive a JWT.',
    security: [],
    request: {
      body: {
        content: { 'application/json': { schema: loginSchema } },
        required: true,
      },
    },
    responses: {
      200: { description: 'JWT token + user info' },
      401: { description: 'Invalid credentials' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/auth/register',
    tags: ['Auth'],
    summary: 'Register user (admin only)',
    request: {
      body: {
        content: { 'application/json': { schema: registerSchema } },
        required: true,
      },
    },
    responses: {
      201: { description: 'User created' },
      409: { description: 'Email already exists' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/auth/me',
    tags: ['Auth'],
    summary: 'Get current user',
    responses: { 200: { description: 'Current user info' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/catalog/categories',
    tags: ['Catalog'],
    summary: 'List service categories',
    responses: { 200: { description: 'Array of categories' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/catalog/categories',
    tags: ['Catalog'],
    summary: 'Create category (admin)',
    request: {
      body: {
        content: { 'application/json': { schema: createCategorySchema } },
        required: true,
      },
    },
    responses: { 201: { description: 'Category created' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/catalog/items',
    tags: ['Catalog'],
    summary: 'List service items',
    request: { query: catalogItemsQuerySchema },
    responses: { 200: { description: 'Array of service items' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/catalog/items/{id}',
    tags: ['Catalog'],
    summary: 'Get service item by id',
    request: { params: uuidParam },
    responses: { 200: { description: 'Service item' }, 404: { description: 'Not found' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/catalog/items',
    tags: ['Catalog'],
    summary: 'Create service item (admin)',
    request: {
      body: {
        content: { 'application/json': { schema: createServiceItemSchema } },
        required: true,
      },
    },
    responses: { 201: { description: 'Item created' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/requests',
    tags: ['Requests'],
    summary: 'List requests',
    request: { query: paginationSchema },
    responses: { 200: { description: 'Paginated requests' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/requests',
    tags: ['Requests'],
    summary: 'Submit a service request',
    request: {
      body: {
        content: { 'application/json': { schema: createRequestSchema } },
        required: true,
      },
    },
    responses: { 201: { description: 'Request created' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/requests/{id}',
    tags: ['Requests'],
    summary: 'Get request details',
    request: { params: uuidParam },
    responses: { 200: { description: 'Request details' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/requests/{id}/approve',
    tags: ['Requests'],
    summary: 'Approve or reject a request',
    request: {
      params: uuidParam,
      body: {
        content: { 'application/json': { schema: approveRequestSchema } },
        required: true,
      },
    },
    responses: { 200: { description: 'Request approved/rejected' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/incidents',
    tags: ['Incidents'],
    summary: 'List incidents',
    request: { query: incidentListQuerySchema },
    responses: { 200: { description: 'Paginated incidents' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/incidents',
    tags: ['Incidents'],
    summary: 'Create an incident',
    request: {
      body: {
        content: { 'application/json': { schema: createIncidentSchema } },
        required: true,
      },
    },
    responses: { 201: { description: 'Incident created' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/incidents/{id}',
    tags: ['Incidents'],
    summary: 'Get incident details',
    request: { params: uuidParam },
    responses: { 200: { description: 'Incident details' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/incidents/{id}',
    tags: ['Incidents'],
    summary: 'Update an incident',
    request: {
      params: uuidParam,
      body: {
        content: { 'application/json': { schema: updateIncidentSchema } },
        required: true,
      },
    },
    responses: { 200: { description: 'Incident updated' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/incidents/{id}/journal',
    tags: ['Incidents'],
    summary: 'Get incident journal entries',
    request: { params: uuidParam },
    responses: { 200: { description: 'Journal entries' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/incidents/{id}/journal',
    tags: ['Incidents'],
    summary: 'Add a journal entry',
    request: {
      params: uuidParam,
      body: {
        content: { 'application/json': { schema: addJournalEntrySchema } },
        required: true,
      },
    },
    responses: { 201: { description: 'Entry added' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/cmdb/classes',
    tags: ['CMDB'],
    summary: 'List CI classes',
    responses: { 200: { description: 'Array of CI classes' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/cmdb/classes',
    tags: ['CMDB'],
    summary: 'Create a CI class (admin)',
    request: {
      body: {
        content: { 'application/json': { schema: createCIClassSchema } },
        required: true,
      },
    },
    responses: { 201: { description: 'Class created' } },
  });

  registry.registerPath({
    method: 'put',
    path: '/cmdb/classes/{id}',
    tags: ['CMDB'],
    summary: 'Update a CI class',
    request: {
      params: uuidParam,
      body: {
        content: { 'application/json': { schema: updateCIClassSchema } },
        required: true,
      },
    },
    responses: { 200: { description: 'Class updated' } },
  });

  registry.registerPath({
    method: 'delete',
    path: '/cmdb/classes/{id}',
    tags: ['CMDB'],
    summary: 'Delete a CI class',
    request: { params: uuidParam },
    responses: { 204: { description: 'Class deleted' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/cmdb/items',
    tags: ['CMDB'],
    summary: 'List configuration items',
    request: { query: cmdbItemsQuerySchema },
    responses: { 200: { description: 'Paginated CIs' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/cmdb/items/nav',
    tags: ['CMDB'],
    summary: 'CI list prev/next navigation',
    request: { query: cmdbItemsNavQuerySchema },
    responses: { 200: { description: 'Adjacent CI ids' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/cmdb/items',
    tags: ['CMDB'],
    summary: 'Create a configuration item',
    request: {
      body: {
        content: { 'application/json': { schema: createCISchema } },
        required: true,
      },
    },
    responses: { 201: { description: 'CI created' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/cmdb/items/{id}',
    tags: ['CMDB'],
    summary: 'Get CI details with relationships',
    request: { params: uuidParam },
    responses: { 200: { description: 'CI details' } },
  });

  registry.registerPath({
    method: 'patch',
    path: '/cmdb/items/{id}',
    tags: ['CMDB'],
    summary: 'Update a configuration item',
    request: {
      params: uuidParam,
      body: {
        content: { 'application/json': { schema: updateCISchema } },
        required: true,
      },
    },
    responses: { 200: { description: 'CI updated' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/cmdb/items/{id}/history',
    tags: ['CMDB'],
    summary: 'Get CI audit history',
    request: { params: uuidParam },
    responses: { 200: { description: 'Audit trail' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/cmdb/items/{id}/impact',
    tags: ['CMDB'],
    summary: 'Impact analysis (blast radius)',
    request: {
      params: uuidParam,
      query: cmdbImpactQuerySchema,
    },
    responses: { 200: { description: 'Impacted CIs' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/cmdb/relationships',
    tags: ['CMDB'],
    summary: 'List all CI relationships',
    responses: { 200: { description: 'Array of relationships' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/cmdb/relationships',
    tags: ['CMDB'],
    summary: 'Create a CI relationship',
    request: {
      body: {
        content: { 'application/json': { schema: createCIRelationshipSchema } },
        required: true,
      },
    },
    responses: { 201: { description: 'Relationship created' } },
  });

  registry.registerPath({
    method: 'delete',
    path: '/cmdb/relationships/{id}',
    tags: ['CMDB'],
    summary: 'Delete a CI relationship',
    request: { params: uuidParam },
    responses: { 200: { description: 'Relationship deleted' } },
  });

  const exportItemParams = z.object({ id: z.string().uuid() });
  const exportRuleParams = z.object({ id: z.string().uuid() });

  registry.registerPath({
    method: 'get',
    path: '/admin/config-packages/export/catalog/items/{id}',
    tags: ['Config packages'],
    summary: 'Export a single catalog service item as a bundle fragment',
    request: { params: exportItemParams },
    responses: { 200: { description: 'Configuration package JSON' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/admin/config-packages/export/catalog',
    tags: ['Config packages'],
    summary: 'Export full catalog as a configuration package',
    responses: { 200: { description: 'Configuration package JSON' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/admin/config-packages/export/notifications/rules/{id}',
    tags: ['Config packages'],
    summary: 'Export one notification rule as a bundle fragment',
    request: { params: exportRuleParams },
    responses: { 200: { description: 'Configuration package JSON' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/admin/config-packages/export/notifications',
    tags: ['Config packages'],
    summary: 'Export all notification rules as a configuration package',
    responses: { 200: { description: 'Configuration package JSON' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/admin/config-packages/validate',
    tags: ['Config packages'],
    summary: 'Validate a configuration package (dry run)',
    request: {
      body: {
        content: { 'application/json': { schema: configPackageApplySchema } },
        required: true,
      },
    },
    responses: { 200: { description: 'Validation report' } },
  });

  registry.registerPath({
    method: 'post',
    path: '/admin/config-packages/apply',
    tags: ['Config packages'],
    summary: 'Apply a configuration package',
    request: {
      body: {
        content: { 'application/json': { schema: configPackageApplySchema } },
        required: true,
      },
    },
    responses: { 200: { description: 'Apply result' }, 400: { description: 'Validation failed' } },
  });

  registry.registerPath({
    method: 'get',
    path: '/admin/config-packages/runs',
    tags: ['Config packages'],
    summary: 'List recent config package deployment runs',
    request: { query: configPackageRunsQuerySchema },
    responses: { 200: { description: 'Run history' } },
  });
}
