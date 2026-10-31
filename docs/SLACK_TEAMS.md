# Slack and Teams

Nova Suite posts incident notifications into Slack or Microsoft Teams, keeps later messages on the same incident, and writes a reply back to the incident journal.

Schema `v00.01.21` or later is required (current is `v00.01.25`). On an older database, apply `infra/postgres/migrations/v00.01.21__chat_threads.sql` and set `DB_SCHEMA_VERSION` to the highest applied migration before using this. A mismatch puts the API in degraded mode and stops the worker.

Configuration is admin-only: **Admin → Notification Workflows** (`/admin/notification-config`).

## What Nova Suite does

- A notification rule that includes Slack or Teams posts the rendered message. For an incident, Nova Suite stores a thread row for that webhook.
- SLA warning and breach notices go to every active Slack and Teams webhook.
- A later status change posts `Status: INC0000042 is now in progress` back to the threads already stored for that incident. Chat does not change the incident status.
- An inbound reply is a customer-visible journal comment, prefixed `[Slack]` or `[Teams]`. Nova Suite then posts the current status back.
- Nova Suite ignores its own posts: a Slack `bot_message`, a message with `bot_id`, or any message that contains a line starting with `Status: `.

A thread row is created by the first successful incident notification, or by the first inbound message that Nova Suite can match. A status change before that has nowhere to post.

Incident numbers in chat match `INC` plus at least three digits (`INC0000042`). The match is case-insensitive.

## Reachability

Slack must call Nova Suite over public HTTPS. A private address is not a valid Events request URL. Put Caddy, or another HTTPS proxy, on a public name. Caddy already forwards `/api/*` to the engine.

Nova Suite only posts to public `http` or `https` URLs. Private, link-local, and credential-bearing URLs are rejected. Slack and Office 365 webhook hosts are public and are fine.

## Shared inbound secret

Generic inbound calls, and any Teams inbound call, authenticate with `NOVA_INBOUND_WEBHOOK_SECRET`. Set it on **nova-engine** and recreate that container. Slack Events do not use this secret; they use the signing secret below.

Do not store this value in tenant settings. `GET /api/settings/theme` returns every setting for the default tenant without authentication.

The older `POST /api/webhooks/inbound/journal` route still accepts the same secret. New chat traffic uses `/api/webhooks/inbound/chat`.

## Find the tenant id

`GET /api/auth/me` returns `user.tenant_id`. The seeded demo tenant is `a0000000-0000-0000-0000-000000000001`.

## Slack

Use this when you want a real thread. Nova Suite learns the thread id only when the webhook has both a bot token and a channel id. Without those, the first inbound message that contains the thread id and an incident number stores the link, and earlier outgoing posts are not threaded.

### 1. Create the Slack app

1. Open [api.slack.com/apps](https://api.slack.com/apps) and create an app from scratch.
2. Under **OAuth & Permissions**, add the bot scopes `chat:write` and `channels:history`. Add `groups:history` if the channel is private.
3. Install the app to the workspace and copy the **Bot User OAuth Token** (`xoxb-…`).
4. On **Basic Information**, copy the **Signing Secret**.
5. Invite the bot to the channel (`/invite @YourApp`).
6. Copy the channel id (channel details, the value starting with `C`).

### 2. Save the webhook in Nova Suite

On **Notification Workflows**, choose **New Webhook**, channel Slack, and fill in:

| Field | Value |
| --- | --- |
| Webhook URL | Incoming webhook URL, or any other public HTTPS URL. The form requires this. When a bot token and channel id are both set, posts use `chat.postMessage` and this URL is not called. |
| Slack channel id | Channel id from the step above |
| Bot token | `xoxb-…` token |
| Signing secret | Signing secret from Basic Information |

Save this before turning on Events. Slack signs the URL check, and Nova Suite rejects it until the signing secret is stored.

Use **Test Webhook**. With a token and channel id, the test is a `chat.postMessage` call. The token is not shown again after save.

### 3. Turn on Events

In the Slack app, open **Event Subscriptions**, enable events, and set the request URL to:

```text
https://<your-public-host>/api/webhooks/inbound/chat?tenant_id=<tenant-uuid>
```

Subscribe to the bot event `message.channels`. Add `message.groups` for a private channel. Reinstall the app if Slack asks you to after the scope or event change.

### 4. Send incident notifications

Edit a notification rule and include the Slack channel. The next matching incident event creates the thread. A reply in that thread, or any message that names the incident (`checked INC0000042`), is added to the journal. Slack's `user` field is an id, so the journal line looks like `[Slack] U0123ABCD: …`.

## Teams

Teams incoming webhooks cannot return a conversation id, and this release does not run a Bot Framework bot. Outgoing messages are Office 365 Connector MessageCards. A status update is another card on the same webhook URL.

### Outgoing

1. In the Teams channel, add the classic **Incoming Webhook** connector and copy its URL (`webhook.office.com` or `outlook.office.com`).
2. In Nova Suite, create a webhook with channel Teams and paste that URL. The Slack token fields are not used.
3. Include Teams on a notification rule, then use **Test Webhook**.

A Teams Workflows webhook that expects an Adaptive Card will reject the MessageCard. Use the connector URL above.

### Incoming

Point a caller at:

```text
POST https://<your-public-host>/api/webhooks/inbound/chat
```

Send the shared secret in `X-Nova-Webhook-Secret` or in `secret`. Send the tenant in `tenant_id`, in the `tenant_id` query parameter, or in `X-Nova-Tenant-Id`.

```json
{
  "tenant_id": "a0000000-0000-0000-0000-000000000001",
  "channel": "teams",
  "incident_number": "INC0000042",
  "thread_id": "conversation-id",
  "author_name": "Ada",
  "text": "We see this on INC0000042 as well",
  "event_id": "unique-delivery-id"
}
```

`channel` may be `slack` with the same shape. `thread_id` is optional. When it is present, a later message with the same id maps back to the incident even if the text has no incident number. `event_id` makes a retry return success without a second journal comment.

A Bot Framework activity (`channelId` of `msteams`, plus `conversation.id` and `text`) is accepted too, with the same secret. A Teams outgoing webhook cannot add that secret, so it will not authenticate.

## Generic call

The same endpoint accepts Slack's `url_verification` and `event_callback` envelopes when the signing secret matches. Everyone else uses the JSON above.

| Result | Meaning |
| --- | --- |
| `200` and `{ "challenge": "…" }` | Slack URL check succeeded |
| `200` and `{ "ignored": true }` | Empty text, or one of Nova Suite's own status posts |
| `200` and `{ "already_processed": true }` | This `event_id` was already stored |
| `201` | Journal comment added, then a status card or thread reply was attempted |
| `401` | Signature or shared secret did not match |
| `404` | No incident for that thread or incident number |

Slack signatures older than five minutes are rejected.
