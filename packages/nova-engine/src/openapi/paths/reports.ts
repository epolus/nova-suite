/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const reportDefinitionBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  visibility: z.string().optional(),
  components: z.array(z.record(z.string(), z.unknown())).optional(),
  is_active: z.boolean().optional(),
}).loose();

const previewBody = z.object({
  components: z.array(z.record(z.string(), z.unknown())).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
}).loose();

const exportBody = z.object({
  report_definition_id: z.string().uuid().optional(),
  format: z.string().optional(),
  components: z.array(z.record(z.string(), z.unknown())).optional(),
}).loose();

const activityQuery = z.object({
  report_definition_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().optional(),
}).loose();

export function registerReportPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/reports/kpis', 'Reports', 'Reporting KPI summary cards', {
    200: { description: 'KPIs' },
    403: { description: 'Reporting role required' },
  });

  registerOp(registry, 'get', '/reports/definitions', 'Reports', 'List report definitions', {
    200: { description: 'Definitions' },
  });

  registerOp(registry, 'post', '/reports/definitions', 'Reports', 'Create a report definition', {
    201: { description: 'Created' },
  }, jsonBody(reportDefinitionBody));

  registerOp(registry, 'get', '/reports/definitions/{id}', 'Reports', 'Get a report definition', {
    200: { description: 'Definition' },
    404: { description: 'Not found' },
  }, { params: uuidParam });

  registerOp(registry, 'patch', '/reports/definitions/{id}', 'Reports', 'Update a report definition', {
    200: { description: 'Updated' },
  }, { params: uuidParam, ...jsonBody(reportDefinitionBody) });

  registerOp(registry, 'delete', '/reports/definitions/{id}', 'Reports', 'Delete a report definition', {
    200: { description: 'Deleted' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/reports/preview', 'Reports', 'Preview report components without saving', {
    200: { description: 'Preview payload' },
  }, jsonBody(previewBody));

  registerOp(registry, 'post', '/reports/definitions/{id}/run', 'Reports', 'Run a saved report definition', {
    200: { description: 'Run result' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/reports/exports', 'Reports', 'Create a report export', {
    201: { description: 'Export created' },
  }, jsonBody(exportBody));

  registerOp(registry, 'get', '/reports/exports', 'Reports', 'List report exports', {
    200: { description: 'Exports' },
  });

  registerOp(registry, 'get', '/reports/activity', 'Reports', 'List recent report activity', {
    200: { description: 'Activity' },
  }, { query: activityQuery });
}
