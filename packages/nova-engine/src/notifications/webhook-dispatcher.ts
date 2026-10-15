/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  buildIncomingWebhookPayload,
  type NotificationWebhookChannel,
  type NotificationWebhookMessage,
} from '@nova-suite/shared';
import type { PoolClient } from 'pg';
import { fetchPublicHttp, UnsafeHttpUrlError } from '../data/public-http-url';
import { logger } from '../logger';

export type WebhookDispatchResult = {
  webhookId: string;
  name: string;
  channel: NotificationWebhookChannel;
  ok: boolean;
  status?: number;
  error?: string;
};

export async function postNotificationWebhook(
  channel: NotificationWebhookChannel,
  webhookUrl: string,
  message: NotificationWebhookMessage,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const body = buildIncomingWebhookPayload(channel, message);
  try {
    const res = await fetchPublicHttp(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        ok: false,
        status: res.status,
        error: errText.slice(0, 500) || `HTTP ${res.status}`,
      };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    const messageText = err instanceof UnsafeHttpUrlError
      ? err.message
      : err instanceof Error
        ? err.message
        : 'webhook post failed';
    return { ok: false, error: messageText };
  }
}

type WebhookRow = {
  id: string;
  name: string;
  channel: NotificationWebhookChannel;
  webhook_url: string;
};

/** Post to all active tenant webhooks for the given channel(s). */
export async function dispatchTenantWebhookNotifications(
  client: PoolClient,
  channels: NotificationWebhookChannel | NotificationWebhookChannel[],
  message: NotificationWebhookMessage,
): Promise<WebhookDispatchResult[]> {
  const channelList = Array.isArray(channels) ? channels : [channels];
  if (channelList.length === 0) return [];

  const rows = await client.query<WebhookRow>(
    `SELECT id, name, channel, webhook_url
     FROM tenant_notification_webhooks
     WHERE tenant_id = current_tenant_id()
       AND is_active = true
       AND channel = ANY($1::notification_webhook_channel[])`,
    [channelList],
  );

  const results: WebhookDispatchResult[] = [];
  for (const row of rows.rows) {
    const posted = await postNotificationWebhook(row.channel, row.webhook_url, message);
    results.push({
      webhookId: row.id,
      name: row.name,
      channel: row.channel,
      ok: posted.ok,
      status: posted.status,
      error: posted.error,
    });
    if (!posted.ok) {
      logger.warn(
        { webhookId: row.id, channel: row.channel, error: posted.error, status: posted.status },
        'Notification webhook delivery failed',
      );
    }
  }
  return results;
}
