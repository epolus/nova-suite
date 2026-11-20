/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { uuidSchema } from '../../domain/schemas';
import { jsonBody, registerOp } from '../helpers';

const submitBodySchema = z.object({
  score: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(4000).nullable().optional(),
});

const incidentParam = z.object({ incidentId: uuidSchema });
const tokenParam = z.object({ token: z.string().min(16).max(128) });

export function registerCsatPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/csat/incident/{incidentId}', 'CSAT', 'Get CSAT survey status for an incident (agent)', {
    200: { description: 'CSAT view' },
    404: { description: 'Not found' },
  }, { params: incidentParam });

  registerOp(registry, 'get', '/csat/{token}', 'CSAT', 'Public CSAT survey view by token', {
    200: { description: 'Survey form data' },
    404: { description: 'Invalid / expired token' },
  }, { params: tokenParam }, { security: [] });

  registerOp(registry, 'post', '/csat/{token}', 'CSAT', 'Submit a public CSAT response', {
    200: { description: 'Submitted' },
    400: { description: 'Invalid score / already submitted' },
  }, { params: tokenParam, ...jsonBody(submitBodySchema) }, { security: [] });
}
