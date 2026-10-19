/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ChatInboundMessage } from '@nova-suite/shared';
import { incidentStatusReply } from '@nova-suite/shared';
import { db } from '../data/db';
import { logger } from '../logger';
import { postChatWebhook } from './webhook-dispatcher';

type Sql = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
};

type ThreadTarget = {
  id: string;
  channel: 'slack' | 'teams';
  webhook_url: string;
  api_token: string | null;
  reply_channel_id: string | null;
  external_thread_id: string | null;
};

export async function replyIncidentStatus(
  client: Sql,
  incident: { id: string; number: string; status: string },
): Promise<void> {
  const rows = await client.query(
    `SELECT t.id, t.channel, t.external_thread_id, w.webhook_url, w.api_token, w.reply_channel_id
     FROM chat_threads t
     JOIN tenant_notification_webhooks w ON w.id = t.webhook_id AND w.tenant_id = t.tenant_id
     WHERE t.tenant_id = current_tenant_id()
       AND t.entity_type = 'incident'
       AND t.entity_id = $1
       AND w.is_active = true`,
    [incident.id],
  );
  const message = incidentStatusReply(incident.number, incident.status);
  for (const row of rows.rows as ThreadTarget[]) {
    const posted = await postChatWebhook({
      channel: row.channel,
      webhookUrl: row.webhook_url,
      threadId: row.external_thread_id,
      apiToken: row.api_token,
      replyChannelId: row.reply_channel_id,
    }, message);
    if (!posted.ok) {
      logger.warn(
        { threadId: row.id, channel: row.channel, error: posted.error, status: posted.status },
        'Chat status reply failed',
      );
      continue;
    }
    if (posted.threadId && !row.external_thread_id) {
      await client.query(
        `UPDATE chat_threads
         SET external_thread_id = $2, updated_at = now()
         WHERE id = $1 AND external_thread_id IS NULL`,
        [row.id, posted.threadId],
      );
    }
  }
}

export type RecordedChat =
  | { kind: 'recorded'; incidentId: string; incidentNumber: string; status: string }
  | { kind: 'duplicate' }
  | { kind: 'missing' };

export async function recordChatInbound(
  message: ChatInboundMessage,
  authorId: string,
): Promise<RecordedChat> {
  if (message.eventId) {
    const receipt = await db.query(
      `INSERT INTO chat_inbound_receipts (tenant_id, channel, external_event_id)
       VALUES (current_tenant_id(), $1::notification_webhook_channel, $2)
       ON CONFLICT (tenant_id, channel, external_event_id) DO NOTHING
       RETURNING external_event_id`,
      [message.channel, message.eventId],
    );
    if (receipt.rowCount === 0) return { kind: 'duplicate' };
  }

  let incidentId: string | null = null;
  let incidentNumber: string | null = message.incidentNumber;
  let status = '';
  let webhookId: string | null = null;

  if (message.threadId) {
    const thread = await db.getOne<{
      entity_id: string;
      webhook_id: string;
      number: string;
      status: string;
    }>(
      `SELECT t.entity_id, t.webhook_id, i.number, i.status
       FROM chat_threads t
       JOIN incidents i ON i.id = t.entity_id AND i.tenant_id = t.tenant_id
       WHERE t.tenant_id = current_tenant_id()
         AND t.channel = $1::notification_webhook_channel
         AND t.external_thread_id = $2
       LIMIT 1`,
      [message.channel, message.threadId],
    );
    if (thread) {
      incidentId = thread.entity_id;
      incidentNumber = thread.number;
      status = thread.status;
      webhookId = thread.webhook_id;
    }
  }

  if (!incidentId && incidentNumber) {
    const incident = await db.getOne<{ id: string; number: string; status: string }>(
      `SELECT id, number, status
       FROM incidents
       WHERE tenant_id = current_tenant_id() AND number = $1
       LIMIT 1`,
      [incidentNumber],
    );
    if (incident) {
      incidentId = incident.id;
      incidentNumber = incident.number;
      status = incident.status;
    }
  }

  if (!incidentId || !incidentNumber) return { kind: 'missing' };

  if (!webhookId) {
    const webhook = await db.getOne<{ id: string }>(
      `SELECT id
       FROM tenant_notification_webhooks
       WHERE tenant_id = current_tenant_id()
         AND channel = $1::notification_webhook_channel
         AND is_active = true
       ORDER BY created_at
       LIMIT 1`,
      [message.channel],
    );
    webhookId = webhook?.id || null;
  }

  if (webhookId) {
    await db.query(
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
      [webhookId, message.channel, incidentId, incidentNumber, message.threadId],
    );
  }

  const label = message.channel === 'slack' ? 'Slack' : 'Teams';
  const who = message.authorName ? `${message.authorName}: ` : '';
  await db.query(
    `INSERT INTO incident_journal (
       tenant_id, incident_id, author_id, entry_type, content, is_customer_visible
     ) VALUES (
       current_tenant_id(), $1, $2, 'comment', $3, true
     )`,
    [incidentId, authorId, `[${label}] ${who}${message.text}`],
  );

  return { kind: 'recorded', incidentId, incidentNumber, status };
}
