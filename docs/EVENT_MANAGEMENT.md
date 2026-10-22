# Event management

Monitoring events land in `events`, roll up into one open `alerts` row per source and fingerprint, and the first matching `alert_definitions` row decides what that episode does. Active definitions are tried in ascending `sort_order` (then name). After the first match, no other rule runs.

Schema `v00.01.22` is required. Apply `infra/postgres/migrations/v00.01.22__event_management.sql` and set `DB_SCHEMA_VERSION=v00.01.22`.

A seeded definition, **Critical alert opens an incident**, matches severity `critical`. `page` and `error` count as critical. A warning is stored and does not open an incident unless you add a definition for it.

## Send alerts

`POST /api/webhooks/inbound/events?tenant_id=<tenant-uuid>`

Authenticate with `NOVA_INBOUND_WEBHOOK_SECRET` (or `X-Nova-Webhook-Secret`, or `Authorization: Bearer`). The same secret is documented in [SLACK_TEAMS.md](./SLACK_TEAMS.md). Do not put it in tenant settings.

Prometheus Alertmanager:

```text
https://<public-host>/api/webhooks/inbound/events?tenant_id=<tenant-uuid>
```

The body is a normal Alertmanager webhook message. Each alert in `alerts[]` becomes one event. The fingerprint is the group key. A later `firing` with the same fingerprint updates the open alert. A `resolved` message closes it.

A generic sender can post one object:

```json
{
  "source": "zabbix",
  "fingerprint": "disk-db-1",
  "status": "firing",
  "severity": "critical",
  "title": "Disk full",
  "ci": "db-1",
  "source_url": "https://zabbix.example/item/1",
  "event_id": "unique-delivery-id"
}
```

`ci` matches `configuration_items.external_id_1`, `external_id_2`, or the CI name. Alertmanager also tries `instance`, with the port stripped.

## What a definition can do

An admin or **event manager** opens **Alert Definitions** (`/admin/alert-definitions`).

| Action | Result |
| --- | --- |
| Create an incident | One incident, and only when a CI matched and an assignment group is available. The definition's group wins. Otherwise Nova Suite uses the CI support group. If the CI shows up on a later firing and the alert still has no incident, Nova Suite opens it then. |
| Notify on alert.firing | Starts the notification workflow for entity `alert` and trigger `alert.firing`. Add that rule under Notification Workflows. |
| Store only | The alert stays on the Alerts list. |

A scheduled or implementing change on that CI, whose window covers the alert, suppresses both actions and records the change number on the alert.

A resolved alert adds a journal line on its incident. If the incident is still `new` and nobody has added a comment, work note, or other update, Nova Suite resolves it. If that incident is later resolved or closed and the same alert fires again, Nova Suite moves it back to in progress.

**Event operators** and **event managers** see the episodes under **Alerts**. A fulfiller does not, unless they also have one of those roles. Assign both roles under Admin → Roles. The incident sidebar lists other recent alerts and changes for the same CI for those roles. Those are hints. Nova Suite does not write the root cause.
