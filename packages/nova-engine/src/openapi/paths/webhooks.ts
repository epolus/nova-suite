/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { jsonBody, registerOp } from '../helpers';

const journalWebhookBody = z.object({
  tenant_id: z.string().uuid().optional(),
  incident_number: z.string().min(1),
  text: z.string().min(1),
  secret: z.string().optional(),
}).loose();

const eventsWebhookBody = z.object({
  alerts: z.array(z.record(z.string(), z.unknown())).optional(),
}).loose();

const chatWebhookBody = z.object({}).loose();

export function registerWebhookPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'post', '/webhooks/inbound/journal', 'Webhooks', 'Inbound journal webhook for incidents', {
    200: { description: 'Journal entry appended' },
    401: { description: 'Invalid webhook secret' },
  }, jsonBody(journalWebhookBody), {
    security: [],
    description: 'Authenticate with `X-Nova-Webhook-Secret` or body `secret` matching the tenant setting.',
  });

  registerOp(registry, 'post', '/webhooks/inbound/events', 'Webhooks', 'Inbound alert/event webhook', {
    202: { description: 'Events accepted' },
    401: { description: 'Invalid shared secret / bearer' },
  }, jsonBody(eventsWebhookBody), { security: [] });

  registerOp(registry, 'post', '/webhooks/inbound/chat', 'Webhooks', 'Inbound chat command webhook (e.g. Slack)', {
    200: { description: 'Chat response / ack' },
    401: { description: 'Invalid signature / secret' },
  }, jsonBody(chatWebhookBody), { security: [] });
}
