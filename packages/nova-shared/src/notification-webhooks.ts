/* SPDX-License-Identifier: AGPL-3.0-only */

export type NotificationWebhookChannel = 'slack' | 'teams';

export type NotificationWebhookMessage = {
  title: string;
  text: string;
};

function slackText(message: NotificationWebhookMessage): string {
  const title = message.title.trim();
  const text = message.text.trim();
  if (title && text) return `*${title}*\n${text}`;
  return title || text || 'Nova Suite notification';
}

/** Slack incoming webhook payload. `threadId` replies in an existing thread. */
export function buildSlackIncomingWebhookPayload(
  message: NotificationWebhookMessage,
  threadId?: string | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { text: slackText(message) };
  if (threadId) payload.thread_ts = threadId;
  return payload;
}

/** Slack Web API chat.postMessage body. The response `ts` is the thread id. */
export function buildSlackChatPostPayload(
  channelId: string,
  message: NotificationWebhookMessage,
  threadId?: string | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    channel: channelId,
    text: slackText(message).replace(/\*/g, ''),
  };
  if (threadId) payload.thread_ts = threadId;
  return payload;
}

export function readSlackMessageTs(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const row = body as { ok?: unknown; ts?: unknown };
  if (row.ok === false) return null;
  return typeof row.ts === 'string' && row.ts.trim() ? row.ts : null;
}

/** Microsoft Teams Office 365 Connector / Incoming Webhook MessageCard. */
export function buildTeamsIncomingWebhookPayload(
  message: NotificationWebhookMessage,
): Record<string, unknown> {
  const title = message.title.trim() || 'Nova Suite';
  const text = message.text.trim() || title;
  return {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    summary: title,
    themeColor: '0076D7',
    title,
    text,
  };
}

export function buildIncomingWebhookPayload(
  channel: NotificationWebhookChannel,
  message: NotificationWebhookMessage,
  threadId?: string | null,
): Record<string, unknown> {
  return channel === 'slack'
    ? buildSlackIncomingWebhookPayload(message, threadId)
    : buildTeamsIncomingWebhookPayload(message);
}
