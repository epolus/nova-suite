/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { registerOp } from '../helpers';

const searchQuery = z.object({
  q: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  type: z.string().optional(),
}).loose();

export function registerSearchAndApprovalPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/search', 'Search', 'Global fuzzy search across ITSM records', {
    200: { description: 'Ranked search results' },
  }, { query: searchQuery }, {
    description:
      'Searches incidents, changes, problems, knowledge articles, CIs, and catalog items. '
      + 'Empty or missing `q` returns an empty result set.',
  });

  registerOp(registry, 'get', '/approvals', 'Approvals', 'List approvals for the current user', {
    200: { description: 'Approval list' },
  });

  registerOp(registry, 'get', '/approvals/pending-count', 'Approvals', 'Pending approval count for the current user', {
    200: { description: '{ count }' },
  });
}
