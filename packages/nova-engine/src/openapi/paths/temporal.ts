/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { jsonBody, registerOp, workflowRunParams } from '../helpers';

const workflowListQuery = z.object({
  status: z.string().optional(),
  type: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  pageToken: z.string().optional(),
}).loose();

const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  pageToken: z.string().optional(),
}).loose();

const terminateSchema = z.object({
  reason: z.string().max(2000).optional(),
});

export function registerTemporalPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/temporal/overview', 'Temporal', 'Temporal namespace overview', {
    200: { description: 'Namespace health and 24h counters' },
  });

  registerOp(registry, 'get', '/temporal/workflows', 'Temporal', 'List workflows', {
    200: { description: 'Workflow executions page' },
  }, { query: workflowListQuery });

  registerOp(registry, 'get', '/temporal/workflows/{workflowId}/{runId}', 'Temporal', 'Describe a workflow', {
    200: { description: 'Workflow description' },
    404: { description: 'Not found' },
  }, { params: workflowRunParams });

  registerOp(registry, 'get', '/temporal/workflows/{workflowId}/{runId}/history', 'Temporal', 'Workflow event history', {
    200: { description: 'History events page' },
  }, { params: workflowRunParams, query: historyQuery });

  registerOp(registry, 'post', '/temporal/workflows/{workflowId}/{runId}/terminate', 'Temporal', 'Terminate a workflow', {
    200: { description: 'Terminated' },
  }, { params: workflowRunParams, ...jsonBody(terminateSchema) });

  registerOp(registry, 'post', '/temporal/workflows/{workflowId}/{runId}/cancel', 'Temporal', 'Cancel a workflow', {
    200: { description: 'Cancelled' },
  }, { params: workflowRunParams });
}
