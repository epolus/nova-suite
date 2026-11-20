/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { uuidSchema } from '../../domain/schemas';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const aiConversationContextSchema = z.object({
  incidentId: uuidSchema.optional(),
  catalogTaskId: uuidSchema.optional(),
  serviceItemId: uuidSchema.optional(),
});

const createConversationSchema = z.object({
  persona: z.enum(['ess', 'agent']),
  context: aiConversationContextSchema.optional(),
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(8000),
  stream: z.boolean().optional(),
  context: aiConversationContextSchema.optional(),
});

const actionParams = z.object({ id: uuidSchema, actionId: uuidSchema });

export function registerAiPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/ai/status', 'AI', 'AI feature / provider status', {
    200: { description: 'Enabled flags and provider readiness' },
  });

  registerOp(registry, 'post', '/ai/conversations', 'AI', 'Start an AI conversation', {
    201: { description: 'Conversation created' },
    403: { description: 'Persona not allowed' },
    503: { description: 'AI disabled / provider missing' },
  }, jsonBody(createConversationSchema));

  registerOp(registry, 'get', '/ai/conversations/{id}', 'AI', 'Get an AI conversation', {
    200: { description: 'Conversation with messages' },
    404: { description: 'Not found' },
  }, { params: uuidParam });

  registerOp(registry, 'post', '/ai/conversations/{id}/messages', 'AI', 'Send a message in an AI conversation', {
    200: { description: 'Assistant reply (or stream)' },
    429: { description: 'Rate limited' },
  }, { params: uuidParam, ...jsonBody(sendMessageSchema) });

  registerOp(
    registry,
    'post',
    '/ai/conversations/{id}/actions/{actionId}/confirm',
    'AI',
    'Confirm a pending AI tool action',
    { 200: { description: 'Action confirmed' } },
    { params: actionParams },
  );

  registerOp(
    registry,
    'delete',
    '/ai/conversations/{id}/actions/{actionId}',
    'AI',
    'Dismiss a pending AI tool action',
    { 200: { description: 'Action dismissed' } },
    { params: actionParams },
  );
}
