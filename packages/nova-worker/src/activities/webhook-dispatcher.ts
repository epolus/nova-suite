/* SPDX-License-Identifier: AGPL-3.0-only */
import type { NotificationWebhookChannel, NotificationWebhookMessage } from '@nova-suite/shared';
import { postChatWebhook } from '@nova-suite/shared/node';
import type { PoolClient } from 'pg';
import { log } from '@temporalio/activity';

export type WebhookDispatchResult = {
  webhookId: string;
  name: string;
  channel: NotificationWebhookChannel;
  ok: boolean;
  status?: number;
  error?: string;
};

type WebhookRow = {
  id: string;
  name: string;
  channel: NotificationWebhookChannel;
  webhook_url: string;
  api_token: string | null;
  reply_channel_id: string | null;
};

export type IncidentChatRef = {
  entityId: string;
  entityNumber: string;
};

/** Post to all active tenant webhooks. Incident refs are stored as chat threads. */
export async function dispatchTenantWebhookNotifications(
  client: PoolClient,
  channels: NotificationWebhookChannel | NotificationWebhookChannel[],
  message: NotificationWebhookMessage,
  incident?: IncidentChatRef,
): Promise<WebhookDispatchResult[]> {
  const channelList = Array.isArray(channels) ? channels : [channels];
  if (channelList.length === 0) return [];

  const rows = await client.query<WebhookRow>(
    `SELECT id, name, channel, webhook_url, api_token, reply_channel_id
     FROM tenant_notification_webhooks
     WHERE tenant_id = current_tenant_id()
       AND is_active = true
       AND channel = ANY($1::notification_webhook_channel[])`,
    [channelList],
  );

  const results: WebhookDispatchResult[] = [];
  for (const row of rows.rows) {
    let threadId: string | null = null;
    if (incident) {
      const existing = await client.query<{ external_thread_id: string | null }>(
        `SELECT external_thread_id
         FROM chat_threads
         WHERE tenant_id = current_tenant_id()
           AND webhook_id = $1
           AND entity_type = 'incident'
           AND entity_id = $2`,
        [row.id, incident.entityId],
      );
      threadId = existing.rows[0]?.external_thread_id || null;
    }
    const posted = await postChatWebhook({
      channel: row.channel,
      webhookUrl: row.webhook_url,
      threadId,
      apiToken: row.api_token,
      replyChannelId: row.reply_channel_id,
    }, message);
    if (incident && posted.ok) {
      try {
        await client.query(
          `INSERT INTO chat_threads (
             tenant_id, webhook_id, channel, entity_type, entity_id, entity_number, external_thread_id
           ) VALUES (
             current_tenant_id(), $1, $2::notification_webhook_channel, 'incident', $3, $4, $5
           )
           ON CONFLICT (tenant_id, webhook_id, entity_type, entity_id)
           DO UPDATE SET
             entity_number = EXCLUDED.entity_number,
             external_thread_id = COALESCE(chat_threads.external_thread_id, EXCLUDED.external_thread_id),
             updated_at = now()`,
          [row.id, row.channel, incident.entityId, incident.entityNumber, posted.threadId || null],
        );
      } catch (err) {
        log.warn('Chat thread was not stored', { webhookId: row.id, incidentId: incident.entityId, err });
      }
    }
    results.push({
      webhookId: row.id,
      name: row.name,
      channel: row.channel,
      ok: posted.ok,
      status: posted.status,
      error: posted.error,
    });
    if (!posted.ok) {
      log.warn('Notification webhook delivery failed', {
        webhookId: row.id,
        channel: row.channel,
        error: posted.error,
        status: posted.status,
      });
    }
  }
  return results;
}
