/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const validateBodySchema = z.object({
  column_mapping: z.record(z.string(), z.string()),
  fixed_values: z.record(z.string(), z.unknown()).optional(),
}).loose();

const rowsQuery = z.object({
  page: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().optional(),
  status: z.string().optional(),
}).loose();

export function registerImportPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/import/entities', 'Import', 'List importable entity types', {
    200: { description: 'Entity types' },
    403: { description: 'Admin only' },
  });

  registerOp(registry, 'get', '/import', 'Import', 'List import jobs', {
    200: { description: 'Import jobs' },
  });

  registerOp(registry, 'post', '/import/upload', 'Import', 'Upload a spreadsheet/CSV for import', {
    201: { description: 'Import job created' },
  }, {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.string().openapi({ format: 'binary' }),
            entity_type: z.string().min(1),
          }),
        },
      },
      required: true,
    },
  });

  registerOp(registry, 'get', '/import/{id}', 'Import', 'Get import job details', {
    200: { description: 'Import job' },
    404: { description: 'Not found' },
  }, { params: uuidParam });

  registerOp(registry, 'get', '/import/{id}/rows', 'Import', 'List parsed/import rows', {
    200: { description: 'Rows' },
  }, { params: uuidParam, query: rowsQuery });

  registerOp(registry, 'post', '/import/{id}/validate', 'Import', 'Validate column mapping for an import job', {
    200: { description: 'Validation report' },
  }, { params: uuidParam, ...jsonBody(validateBodySchema) });

  registerOp(registry, 'post', '/import/{id}/commit', 'Import', 'Commit a validated import job', {
    200: { description: 'Commit result' },
  }, { params: uuidParam });

  registerOp(registry, 'delete', '/import/{id}', 'Import', 'Delete an import job', {
    200: { description: 'Deleted' },
  }, { params: uuidParam });
}
