/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { uuidSchema } from '../domain/schemas';

export const uuidParam = z.object({ id: uuidSchema });
export const workflowRunParams = z.object({
  workflowId: z.string().min(1),
  runId: z.string().min(1),
});

export function jsonBody(schema: z.ZodType) {
  return {
    body: {
      content: { 'application/json': { schema } },
      required: true,
    },
  } as const;
}

type Method = RouteConfig['method'];

export function registerOp(
  registry: OpenAPIRegistry,
  method: Method,
  path: string,
  tag: string,
  summary: string,
  responses: RouteConfig['responses'],
  request?: RouteConfig['request'],
  extras?: Partial<Pick<RouteConfig, 'description' | 'security'>>,
): void {
  registry.registerPath({
    method,
    path,
    tags: [tag],
    summary,
    ...(extras?.description ? { description: extras.description } : {}),
    ...(extras?.security ? { security: extras.security } : {}),
    ...(request ? { request } : {}),
    responses,
  });
}
