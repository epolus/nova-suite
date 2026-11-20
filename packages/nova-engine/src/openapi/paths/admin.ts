/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { adminCreateUserSchema, adminUpdateUserSchema } from '../../domain/schemas';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const looseBody = z.object({}).loose();
const nameBody = z.object({ name: z.string().min(1).optional() }).loose();
const limitQuery = z.object({ limit: z.coerce.number().int().optional() }).loose();
const fieldDefsQuery = z.object({ entity_type: z.string().min(1) }).loose();
const deliveriesQuery = z.object({
  status: z.string().optional(),
  trigger_key: z.string().optional(),
  recipient: z.string().optional(),
  limit: z.coerce.number().int().optional(),
}).loose();

function crudList(
  registry: OpenAPIRegistry,
  path: string,
  singular: string,
  plural: string,
  withDelete = false,
): void {
  registerOp(registry, 'get', path, 'Admin', `List ${plural}`, {
    200: { description: plural },
    403: { description: 'Admin only' },
  });
  registerOp(registry, 'post', path, 'Admin', `Create ${singular}`, {
    201: { description: 'Created' },
  }, jsonBody(looseBody));
  registerOp(registry, 'patch', `${path}/{id}`, 'Admin', `Update ${singular}`, {
    200: { description: 'Updated' },
    404: { description: 'Not found' },
  }, { params: uuidParam, ...jsonBody(looseBody) });
  if (withDelete) {
    registerOp(registry, 'delete', `${path}/{id}`, 'Admin', `Delete ${singular}`, {
      200: { description: 'Deleted' },
      404: { description: 'Not found' },
    }, { params: uuidParam });
  }
}

export function registerAdminPaths(registry: OpenAPIRegistry): void {
  // Ops
  registerOp(registry, 'get', '/admin/audit-events', 'Admin', 'List recent audit events', {
    200: { description: 'Audit events' },
  }, { query: limitQuery });
  registerOp(registry, 'get', '/admin/runtime-health', 'Admin', 'Runtime health snapshot', {
    200: { description: 'Health' },
  });
  registerOp(registry, 'get', '/admin/system-metrics', 'Admin', 'System metrics snapshot', {
    200: { description: 'Metrics' },
  });

  // RBAC
  registerOp(registry, 'get', '/admin/roles', 'Admin', 'List roles', { 200: { description: 'Roles' } });
  registerOp(registry, 'post', '/admin/roles', 'Admin', 'Create role', {
    201: { description: 'Created' },
  }, jsonBody(nameBody));
  registerOp(registry, 'patch', '/admin/roles/{id}', 'Admin', 'Update role', {
    200: { description: 'Updated' },
  }, { params: uuidParam, ...jsonBody(looseBody) });

  // Org units
  crudList(registry, '/admin/departments', 'department', 'departments');
  crudList(registry, '/admin/cost-centers', 'cost center', 'cost centers');
  crudList(registry, '/admin/companies', 'company', 'companies');
  crudList(registry, '/admin/locations', 'location', 'locations');

  // Users
  registerOp(registry, 'get', '/admin/users', 'Admin', 'List users', { 200: { description: 'Users' } });
  registerOp(registry, 'post', '/admin/users', 'Admin', 'Create user', {
    201: { description: 'Created' },
  }, jsonBody(adminCreateUserSchema));
  registerOp(registry, 'patch', '/admin/users/{id}', 'Admin', 'Update user', {
    200: { description: 'Updated' },
  }, { params: uuidParam, ...jsonBody(adminUpdateUserSchema) });
  registerOp(registry, 'delete', '/admin/users/{id}', 'Admin', 'Delete / deactivate user', {
    200: { description: 'Deleted' },
  }, { params: uuidParam });

  // Processes / services / assignment groups
  crudList(registry, '/admin/processes', 'process', 'processes');
  crudList(registry, '/admin/services', 'service', 'services');
  registerOp(registry, 'get', '/admin/assignment-groups', 'Admin', 'List assignment groups', {
    200: { description: 'Assignment groups' },
  }, undefined, {
    description: 'Also available to fulfiller / catalog_designer / on-call roles (read-only).',
  });
  registerOp(registry, 'post', '/admin/assignment-groups', 'Admin', 'Create assignment group', {
    201: { description: 'Created' },
  }, jsonBody(looseBody));
  registerOp(registry, 'patch', '/admin/assignment-groups/{id}', 'Admin', 'Update assignment group', {
    200: { description: 'Updated' },
  }, { params: uuidParam, ...jsonBody(looseBody) });

  // SLA + calendars
  crudList(registry, '/admin/sla-definitions', 'SLA definition', 'SLA definitions', true);
  registerOp(registry, 'get', '/admin/business-calendars', 'Admin', 'List business calendars', {
    200: { description: 'Calendars' },
  });
  registerOp(registry, 'get', '/admin/business-calendars/{id}', 'Admin', 'Get business calendar details', {
    200: { description: 'Calendar with hours/holidays' },
    404: { description: 'Not found' },
  }, { params: uuidParam });
  registerOp(registry, 'post', '/admin/business-calendars', 'Admin', 'Create business calendar', {
    201: { description: 'Created' },
  }, jsonBody(looseBody));
  registerOp(registry, 'patch', '/admin/business-calendars/{id}', 'Admin', 'Update business calendar', {
    200: { description: 'Updated' },
  }, { params: uuidParam, ...jsonBody(looseBody) });
  registerOp(registry, 'delete', '/admin/business-calendars/{id}', 'Admin', 'Delete business calendar', {
    200: { description: 'Deleted' },
  }, { params: uuidParam });

  // Notification admin
  crudList(registry, '/admin/notification-rules', 'notification rule', 'notification rules', true);
  registerOp(registry, 'post', '/admin/notification-rules/{id}/test', 'Admin', 'Send a test notification for a rule', {
    200: { description: 'Test result' },
  }, { params: uuidParam });
  crudList(registry, '/admin/notification-webhooks', 'notification webhook', 'notification webhooks', true);
  registerOp(registry, 'post', '/admin/notification-webhooks/{id}/test', 'Admin', 'Send a test payload to a webhook', {
    200: { description: 'Test result' },
  }, { params: uuidParam });
  registerOp(registry, 'get', '/admin/notification-email-deliveries', 'Admin', 'List notification email deliveries', {
    200: { description: 'Deliveries + summary' },
  }, { query: deliveriesQuery });

  // Workflow definitions
  registerOp(registry, 'get', '/admin/workflow-definitions', 'Admin', 'List workflow definitions', {
    200: { description: 'Definitions' },
  });
  registerOp(registry, 'post', '/admin/workflow-definitions', 'Admin', 'Create workflow definition', {
    201: { description: 'Created' },
  }, jsonBody(looseBody));
  registerOp(registry, 'get', '/admin/workflow-definitions/{id}', 'Admin', 'Get workflow definition', {
    200: { description: 'Definition' },
    404: { description: 'Not found' },
  }, { params: uuidParam });
  registerOp(registry, 'patch', '/admin/workflow-definitions/{id}', 'Admin', 'Update workflow definition', {
    200: { description: 'Updated' },
  }, { params: uuidParam, ...jsonBody(looseBody) });
  registerOp(registry, 'post', '/admin/workflow-definitions/{id}/publish', 'Admin', 'Publish a workflow definition version', {
    200: { description: 'Published' },
  }, { params: uuidParam });
  registerOp(registry, 'post', '/admin/workflow-definitions/{id}/duplicate', 'Admin', 'Duplicate a workflow definition', {
    201: { description: 'Duplicated' },
  }, { params: uuidParam });

  // Automation dry-run
  registerOp(registry, 'post', '/admin/automation/dry-run', 'Admin', 'Dry-run a catalog automation config', {
    200: { description: 'Dry-run report' },
  }, jsonBody(looseBody));

  // Incident classification / custom field definitions (admin)
  crudList(registry, '/admin/incident-categories', 'incident category', 'incident categories', true);
  crudList(registry, '/admin/incident-resolution-codes', 'resolution code', 'resolution codes', true);
  registerOp(registry, 'get', '/admin/field-definitions', 'Admin', 'List custom field definitions', {
    200: { description: 'Definitions' },
  }, { query: fieldDefsQuery });
  registerOp(registry, 'post', '/admin/field-definitions', 'Admin', 'Create custom field definition', {
    201: { description: 'Created' },
  }, jsonBody(looseBody));
  registerOp(registry, 'patch', '/admin/field-definitions/{id}', 'Admin', 'Update custom field definition', {
    200: { description: 'Updated' },
  }, { params: uuidParam, ...jsonBody(looseBody) });
  registerOp(registry, 'delete', '/admin/field-definitions/{id}', 'Admin', 'Delete custom field definition', {
    200: { description: 'Deleted' },
  }, { params: uuidParam });
}
