/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { registerOp } from '../helpers';

const trendsQuery = z.object({
  dataset: z.string().optional(),
  metric: z.string().optional(),
  days: z.coerce.number().int().optional(),
  interval: z.string().optional(),
}).loose();

export function registerAnalyticsPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/analytics/trends/catalog', 'Analytics', 'List available trend metrics for the current user', {
    200: { description: 'Metric catalog (role-filtered)' },
  });

  registerOp(registry, 'get', '/analytics/trends', 'Analytics', 'Fetch a time-series trend metric', {
    200: { description: 'Trend points' },
    403: { description: 'Metric not allowed for role' },
  }, { query: trendsQuery });
}
