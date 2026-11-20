/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  dataManagementJobRequestSchema,
  dataManagementPreviewSchema,
} from '@nova-suite/shared';
import { jsonBody, registerOp, uuidParam } from '../helpers';

export function registerDataManagementPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/data-management/targets', 'Data management', 'List supported bulk-management targets', {
    200: { description: 'Targets and operators' },
    403: { description: 'Admin / data_manager' },
  });

  registerOp(registry, 'post', '/data-management/preview', 'Data management', 'Preview matching records for a bulk action', {
    200: { description: 'Count + sample rows' },
  }, jsonBody(dataManagementPreviewSchema));

  registerOp(registry, 'get', '/data-management/jobs', 'Data management', 'List recent data-management jobs', {
    200: { description: 'Jobs' },
  });

  registerOp(registry, 'post', '/data-management/jobs', 'Data management', 'Enqueue a confirmed bulk action job', {
    202: { description: 'Job queued' },
    400: { description: 'confirm_count mismatch / validation' },
  }, jsonBody(dataManagementJobRequestSchema));

  registerOp(registry, 'get', '/data-management/jobs/{id}', 'Data management', 'Get data-management job status', {
    200: { description: 'Job' },
    404: { description: 'Not found' },
  }, { params: uuidParam });
}
