/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type {
  EmailMessageItem,
  InboundEmailRule,
  InboundEmailRulePayload,
  MailboxItem,
  MailboxPayload,
} from '../types/inboundEmail';

export const inboundEmail = {
  mailboxes: () => request<{ mailboxes: MailboxItem[] }>('/admin/mailboxes'),
  createMailbox: (data: MailboxPayload) =>
    request<MailboxItem>('/admin/mailboxes', { method: 'POST', body: JSON.stringify(data) }),
  updateMailbox: (id: string, data: Partial<MailboxPayload>) =>
    request<{ success: boolean }>(`/admin/mailboxes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteMailbox: (id: string) =>
    request<{ success: boolean }>(`/admin/mailboxes/${id}`, { method: 'DELETE' }),
  messages: (mailboxId: string, limit = 50) =>
    request<{ messages: EmailMessageItem[] }>(`/admin/mailboxes/${mailboxId}/messages?limit=${limit}`),
  ingest: (mailboxId: string, data: {
    from_address: string;
    subject?: string;
    body_text?: string;
    message_id?: string;
    in_reply_to?: string;
    to_addresses?: string;
  }) =>
    request<{
      email_message_id: string;
      status: string;
      incident_id: string | null;
      incident_number: string | null;
      notes: string;
    }>(`/admin/mailboxes/${mailboxId}/ingest`, { method: 'POST', body: JSON.stringify(data) }),
  rules: (mailboxId?: string) =>
    request<{ inbound_email_rules: InboundEmailRule[] }>(
      mailboxId
        ? `/admin/inbound-email-rules?mailbox_id=${encodeURIComponent(mailboxId)}`
        : '/admin/inbound-email-rules',
    ),
  createRule: (data: InboundEmailRulePayload) =>
    request<InboundEmailRule>('/admin/inbound-email-rules', { method: 'POST', body: JSON.stringify(data) }),
  updateRule: (id: string, data: Partial<InboundEmailRulePayload>) =>
    request<{ success: boolean }>(`/admin/inbound-email-rules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteRule: (id: string) =>
    request<{ success: boolean }>(`/admin/inbound-email-rules/${id}`, { method: 'DELETE' }),
};
