/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  buildIncomingWebhookPayload,
  buildSlackChatPostPayload,
  readSlackMessageTs,
  type NotificationWebhookChannel,
  type NotificationWebhookMessage,
} from '../notification-webhooks';
import { fetchPublicHttp } from './public-http-url';

export type ChatWebhookTarget = {
  channel: NotificationWebhookChannel;
  webhookUrl: string;
  threadId?: string | null;
  apiToken?: string | null;
  replyChannelId?: string | null;
};

export type ChatPostResult = {
  ok: boolean;
  status?: number;
  error?: string;
  threadId?: string | null;
};

export async function postChatWebhook(
  target: ChatWebhookTarget,
  message: NotificationWebhookMessage,
): Promise<ChatPostResult> {
  try {
    if (target.channel === 'slack' && target.apiToken && target.replyChannelId) {
      const res = await fetchPublicHttp('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${target.apiToken}`,
        },
        body: JSON.stringify(buildSlackChatPostPayload(target.replyChannelId, message, target.threadId)),
      });
      const raw = await res.text();
      let parsed: unknown = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
      const threadId = readSlackMessageTs(parsed);
      const slackOk = Boolean(parsed && typeof parsed === 'object' && (parsed as { ok?: unknown }).ok === true);
      if (!res.ok || !slackOk) {
        return { ok: false, status: res.status, error: raw.slice(0, 500) || `HTTP ${res.status}`, threadId };
      }
      return { ok: true, status: res.status, threadId: threadId || target.threadId || null };
    }

    const res = await fetchPublicHttp(target.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildIncomingWebhookPayload(target.channel, message, target.threadId)),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: errText.slice(0, 500) || `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, threadId: target.threadId || null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'webhook post failed' };
  }
}
