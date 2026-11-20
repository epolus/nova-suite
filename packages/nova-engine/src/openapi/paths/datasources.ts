/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const datasourceBody = z.object({
  name: z.string().min(1).optional(),
  entity_type: z.string().optional(),
  source_type: z.string().optional(),
  credential_slug: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  mapping: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional(),
  schedule_cron: z.string().nullable().optional(),
}).loose();

const runBody = z.object({
  dry_run: z.boolean().optional(),
}).loose();

const testSourceBody = z.object({
  source_type: z.string().min(1),
  credential_slug: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
}).loose();

export function registerDatasourcePaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/datasources', 'Data sources', 'List data sources', {
    200: { description: 'Data sources' },
    403: { description: 'Admin only' },
  });
  registerOp(registry, 'get', '/datasources/entity-types', 'Data sources', 'List supported import entity types', {
    200: { description: 'Entity types' },
  });
  registerOp(registry, 'post', '/datasources', 'Data sources', 'Create a data source', {
    201: { description: 'Created' },
  }, jsonBody(datasourceBody));
  registerOp(registry, 'post', '/datasources/test-source', 'Data sources', 'Probe a source connection without saving', {
    200: { description: 'Probe result' },
  }, jsonBody(testSourceBody));
  registerOp(registry, 'post', '/datasources/discovery/intune/sync', 'Data sources', 'Trigger Intune discovery sync', {
    202: { description: 'Sync queued' },
  });
  registerOp(registry, 'get', '/datasources/{id}', 'Data sources', 'Get data source details', {
    200: { description: 'Data source' },
    404: { description: 'Not found' },
  }, { params: uuidParam });
  registerOp(registry, 'patch', '/datasources/{id}', 'Data sources', 'Update a data source', {
    200: { description: 'Updated' },
  }, { params: uuidParam, ...jsonBody(datasourceBody) });
  registerOp(registry, 'delete', '/datasources/{id}', 'Data sources', 'Delete a data source', {
    200: { description: 'Deleted' },
  }, { params: uuidParam });
  registerOp(registry, 'post', '/datasources/{id}/run', 'Data sources', 'Run a data source import', {
    202: { description: 'Run started' },
  }, { params: uuidParam, ...jsonBody(runBody) });
  registerOp(registry, 'get', '/datasources/{id}/runs', 'Data sources', 'List recent runs for a data source', {
    200: { description: 'Runs' },
  }, { params: uuidParam });
}
