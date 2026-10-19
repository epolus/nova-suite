/* SPDX-License-Identifier: AGPL-3.0-only */
import type { NotificationWebhookChannel, NotificationWebhookMessage } from './notification-webhooks';

export const CHAT_STATUS_PREFIX = 'Status: ';

const INCIDENT_NUMBER = /\bINC\d{3,}\b/i;

export type ChatInboundMessage = {
  channel: NotificationWebhookChannel;
  threadId: string | null;
  text: string;
  incidentNumber: string | null;
  authorName: string | null;
  eventId: string | null;
  fromBot: boolean;
};

export function incidentStatusReply(number: string, status: string): NotificationWebhookMessage {
  const label = status.replace(/_/g, ' ');
  return {
    title: number,
    text: `${CHAT_STATUS_PREFIX}${number} is now ${label}`,
  };
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function incidentNumberFrom(explicit: string, text: string): string | null {
  const direct = explicit.match(INCIDENT_NUMBER);
  if (direct) return direct[0].toUpperCase();
  const found = text.match(INCIDENT_NUMBER);
  return found ? found[0].toUpperCase() : null;
}

function isStatusEcho(text: string): boolean {
  return text.split('\n').some((line) => line.trim().startsWith(CHAT_STATUS_PREFIX));
}

export function parseChatInbound(body: unknown): ChatInboundMessage | { challenge: string } | null {
  if (!body || typeof body !== 'object') return null;
  const row = body as Record<string, unknown>;

  if (row.type === 'url_verification' && typeof row.challenge === 'string') {
    return { challenge: row.challenge };
  }

  if (row.type === 'event_callback' && row.event && typeof row.event === 'object') {
    const event = row.event as Record<string, unknown>;
    if (event.type !== 'message') return null;
    const text = textOf(event.text);
    const threadId = textOf(event.thread_ts) || textOf(event.ts) || null;
    const fromBot = Boolean(event.bot_id) || event.subtype === 'bot_message' || isStatusEcho(text);
    return {
      channel: 'slack',
      threadId,
      text,
      incidentNumber: incidentNumberFrom('', text),
      authorName: textOf(event.user) || null,
      eventId: textOf(row.event_id) || textOf(event.client_msg_id) || null,
      fromBot,
    };
  }

  const conversation = row.conversation && typeof row.conversation === 'object'
    ? row.conversation as Record<string, unknown>
    : null;
  if ((row.channelId === 'msteams' || row.channelId === 'teams') && conversation) {
    const text = textOf(row.text);
    const from = row.from && typeof row.from === 'object' ? row.from as Record<string, unknown> : null;
    return {
      channel: 'teams',
      threadId: textOf(conversation.id) || null,
      text,
      incidentNumber: incidentNumberFrom('', text),
      authorName: textOf(from?.name) || null,
      eventId: textOf(row.id) || null,
      fromBot: isStatusEcho(text),
    };
  }

  const channel = row.channel === 'teams' ? 'teams' : row.channel === 'slack' ? 'slack' : null;
  if (!channel) return null;
  const text = textOf(row.text) || textOf(row.content);
  return {
    channel,
    threadId: textOf(row.thread_id) || textOf(row.thread_ts) || null,
    text,
    incidentNumber: incidentNumberFrom(textOf(row.incident_number), text),
    authorName: textOf(row.author_name) || null,
    eventId: textOf(row.event_id) || null,
    fromBot: isStatusEcho(text),
  };
}
