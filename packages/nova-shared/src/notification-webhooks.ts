/* SPDX-License-Identifier: AGPL-3.0-only */

export type NotificationWebhookChannel = 'slack' | 'teams';

export type NotificationWebhookMessage = {
  title: string;
  text: string;
};

/** Slack incoming webhook payload (text + optional mrkdwn). */
export function buildSlackIncomingWebhookPayload(
  message: NotificationWebhookMessage,
): Record<string, unknown> {
  const title = message.title.trim();
  const text = message.text.trim();
  if (title && text) {
    return { text: `*${title}*\n${text}` };
  }
  return { text: title || text || 'Nova Suite notification' };
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
): Record<string, unknown> {
  return channel === 'slack'
    ? buildSlackIncomingWebhookPayload(message)
    : buildTeamsIncomingWebhookPayload(message);
}
