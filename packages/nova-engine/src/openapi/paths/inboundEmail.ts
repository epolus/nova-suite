/* SPDX-License-Identifier: AGPL-3.0-only */
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { uuidSchema } from '../../domain/schemas';
import { jsonBody, registerOp, uuidParam } from '../helpers';

const mailboxConfigSchema = z.record(z.string(), z.unknown()).optional();

const mailboxBody = z.object({
  name: z.string().min(1).optional(),
  address: z.string().email().optional(),
  credential_slug: z.string().min(1).optional(),
  config: mailboxConfigSchema,
  assignment_group_id: uuidSchema.nullable().optional(),
  default_service_id: uuidSchema.nullable().optional(),
  poll_interval_seconds: z.number().int().min(30).max(86400).optional(),
  is_active: z.boolean().optional(),
}).loose();

const mailboxCreateBody = z.object({
  name: z.string().min(1),
  address: z.string().email(),
  credential_slug: z.string().min(1),
  config: mailboxConfigSchema,
  assignment_group_id: uuidSchema.nullable().optional(),
  default_service_id: uuidSchema.nullable().optional(),
  poll_interval_seconds: z.number().int().min(30).max(86400).optional(),
  is_active: z.boolean().optional(),
}).loose();

const inboundAction = z.enum(['create_incident', 'update_incident', 'ignore']);

const ruleBody = z.object({
  name: z.string().min(1).optional(),
  mailbox_id: uuidSchema.nullable().optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
  stop_on_match: z.boolean().optional(),
  match_from_contains: z.string().nullable().optional(),
  match_from_regex: z.string().nullable().optional(),
  match_subject_contains: z.string().nullable().optional(),
  match_subject_regex: z.string().nullable().optional(),
  match_body_contains: z.string().nullable().optional(),
  match_has_ticket_ref: z.boolean().optional(),
  match_in_reply_to_known: z.boolean().optional(),
  action: inboundAction.optional(),
  require_open_incident: z.boolean().optional(),
  journal_entry_type: z.enum(['comment', 'work_note']).optional(),
}).loose();

const ruleCreateBody = z.object({
  name: z.string().min(1),
  mailbox_id: uuidSchema.nullable().optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
  stop_on_match: z.boolean().optional(),
  match_from_contains: z.string().nullable().optional(),
  match_from_regex: z.string().nullable().optional(),
  match_subject_contains: z.string().nullable().optional(),
  match_subject_regex: z.string().nullable().optional(),
  match_body_contains: z.string().nullable().optional(),
  match_has_ticket_ref: z.boolean().optional(),
  match_in_reply_to_known: z.boolean().optional(),
  action: inboundAction,
  require_open_incident: z.boolean().optional(),
  journal_entry_type: z.enum(['comment', 'work_note']).optional(),
}).loose();

const messagesQuery = z.object({
  mailbox_id: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
}).loose();

const ingestBody = z.object({
  from_address: z.string().min(1),
  subject: z.string().optional(),
  body_text: z.string().nullable().optional(),
  body_html: z.string().nullable().optional(),
  message_id: z.string().nullable().optional(),
  in_reply_to: z.string().nullable().optional(),
  to_addresses: z.string().optional(),
}).loose();

const rulesQuery = z.object({
  mailbox_id: uuidSchema.optional(),
}).loose();

export function registerInboundEmailPaths(registry: OpenAPIRegistry): void {
  registerOp(registry, 'get', '/admin/mailboxes', 'Inbound email', 'List IMAP mailboxes', {
    200: { description: 'Mailboxes' },
    403: { description: 'Admin only' },
  });
  registerOp(registry, 'post', '/admin/mailboxes', 'Inbound email', 'Create IMAP mailbox', {
    201: { description: 'Mailbox created' },
    403: { description: 'Admin only' },
  }, jsonBody(mailboxCreateBody));
  registerOp(registry, 'patch', '/admin/mailboxes/{id}', 'Inbound email', 'Update IMAP mailbox', {
    200: { description: 'Updated' },
    404: { description: 'Not found' },
  }, { params: uuidParam, ...jsonBody(mailboxBody) });
  registerOp(registry, 'delete', '/admin/mailboxes/{id}', 'Inbound email', 'Delete IMAP mailbox', {
    200: { description: 'Deleted' },
    404: { description: 'Not found' },
  }, { params: uuidParam });

  registerOp(registry, 'get', '/admin/mailboxes/messages', 'Inbound email', 'List processed inbound messages', {
    200: { description: 'Messages with matched rule and incident' },
  }, { query: messagesQuery });
  registerOp(registry, 'get', '/admin/mailboxes/{id}/messages', 'Inbound email', 'List messages for one mailbox', {
    200: { description: 'Messages' },
    404: { description: 'Not found' },
  }, { params: uuidParam, query: z.object({ limit: z.coerce.number().int().optional() }).loose() });
  registerOp(registry, 'post', '/admin/mailboxes/{id}/test-login', 'Inbound email', 'Probe IMAP login for a mailbox', {
    200: { description: 'Login probe result' },
    404: { description: 'Not found' },
    503: { description: 'CREDENTIALS_MASTER_KEY missing' },
  }, { params: uuidParam });
  registerOp(registry, 'post', '/admin/mailboxes/{id}/ingest', 'Inbound email', 'Manually ingest a message into a mailbox', {
    202: { description: 'Ingested / processed' },
    404: { description: 'Not found' },
  }, { params: uuidParam, ...jsonBody(ingestBody) });

  registerOp(registry, 'get', '/admin/inbound-email-rules', 'Inbound email', 'List inbound email rules', {
    200: { description: 'Rules' },
  }, { query: rulesQuery });
  registerOp(registry, 'post', '/admin/inbound-email-rules', 'Inbound email', 'Create inbound email rule', {
    201: { description: 'Rule created' },
  }, jsonBody(ruleCreateBody));
  registerOp(registry, 'patch', '/admin/inbound-email-rules/{id}', 'Inbound email', 'Update inbound email rule', {
    200: { description: 'Updated' },
    404: { description: 'Not found' },
  }, { params: uuidParam, ...jsonBody(ruleBody) });
  registerOp(registry, 'delete', '/admin/inbound-email-rules/{id}', 'Inbound email', 'Delete inbound email rule', {
    200: { description: 'Deleted' },
    404: { description: 'Not found' },
  }, { params: uuidParam });
}
