/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  buildIncomingWebhookPayload,
  buildSlackChatPostPayload,
  readSlackMessageTs,
  type NotificationWebhookChannel,
  type NotificationWebhookMessage,
} from '@nova-suite/shared';
import type { PoolClient } from 'pg';
import { log } from '@temporalio/activity';
import { fetchPublicHttp, UnsafeHttpUrlError } from '../public-http-url';

export type WebhookDispatchResult = {
  webhookId: string;
  name: string;
  channel: NotificationWebhookChannel;
  ok: boolean;
  status?: number;
  error?: string;
};

type ChatPostResult = {
  ok: boolean;
  status?: number;
  error?: string;
  threadId?: string | null;
};

export async function postNotificationWebhook(
  channel: NotificationWebhookChannel,
  webhookUrl: string,
  message: NotificationWebhookMessage,
  threadId?: string | null,
  slack?: { apiToken?: string | null; replyChannelId?: string | null },
): Promise<ChatPostResult> {
  try {
    if (channel === 'slack' && slack?.apiToken && slack.replyChannelId) {
      const res = await fetchPublicHttp('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${slack.apiToken}`,
        },
        body: JSON.stringify(buildSlackChatPostPayload(slack.replyChannelId, message, threadId)),
      });
      const raw = await res.text();
      let parsed: unknown = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
      const returnedTs = readSlackMessageTs(parsed);
      const slackOk = Boolean(parsed && typeof parsed === 'object' && (parsed as { ok?: unknown }).ok === true);
      if (!res.ok || !slackOk) {
        return { ok: false, status: res.status, error: raw.slice(0, 500) || `HTTP ${res.status}` };
      }
      return { ok: true, status: res.status, threadId: returnedTs || threadId || null };
    }
    const res = await fetchPublicHttp(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildIncomingWebhookPayload(channel, message, threadId)),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: errText.slice(0, 500) || `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, threadId: threadId || null };
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
    const posted = await postNotificationWebhook(
      row.channel,
      row.webhook_url,
      message,
      threadId,
      { apiToken: row.api_token, replyChannelId: row.reply_channel_id },
    );
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
