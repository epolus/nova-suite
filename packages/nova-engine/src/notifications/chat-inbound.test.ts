/* SPDX-License-Identifier: AGPL-3.0-only */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  incidentStatusReply,
  parseChatInbound,
  buildSlackIncomingWebhookPayload,
} from '@nova-suite/shared';
import { slackSignatureValid } from './slack-signature';

describe('chat inbound', () => {
  it('maps a Slack thread reply and ignores our own status posts', () => {
    const parsed = parseChatInbound({
      type: 'event_callback',
      event_id: 'Ev1',
      event: { type: 'message', text: 'Checked the disk on INC0000042', thread_ts: '171111.0001', user: 'U123' },
    });
    expect(parsed).toMatchObject({
      channel: 'slack',
      threadId: '171111.0001',
      incidentNumber: 'INC0000042',
      eventId: 'Ev1',
      fromBot: false,
    });

    const echo = parseChatInbound({
      type: 'event_callback',
      event: { type: 'message', text: incidentStatusReply('INC0000042', 'in_progress').text, ts: '1' },
    });
    expect(echo && 'fromBot' in echo && echo.fromBot).toBe(true);
  });

  it('maps a Teams activity by conversation id', () => {
    const parsed = parseChatInbound({
      type: 'message',
      id: 'activity-1',
      channelId: 'msteams',
      text: 'We see it too',
      from: { name: 'Ada' },
      conversation: { id: 'conv-9' },
    });
    expect(parsed).toMatchObject({
      channel: 'teams',
      threadId: 'conv-9',
      authorName: 'Ada',
      eventId: 'activity-1',
    });
  });

  it('puts Slack replies on the stored thread', () => {
    expect(buildSlackIncomingWebhookPayload({ title: 'INC0001', text: 'hello' }, '171.1')).toMatchObject({
      thread_ts: '171.1',
    });
  });

  it('accepts a Slack signature for the raw body', () => {
    const raw = '{"type":"event_callback"}';
    const timestamp = '1710000000';
    const secret = 'signing-secret';
    const signature = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${raw}`).digest('hex')}`;
    expect(slackSignatureValid(raw, timestamp, signature, secret, 1710000000 * 1000)).toBe(true);
    expect(slackSignatureValid(raw, timestamp, signature, 'other', 1710000000 * 1000)).toBe(false);
  });
});
