# Nova Suite

**Open-source IT Service Management (ITSM) platform — service catalog, incident, change and problem management, knowledge base, CMDB, and workflow automation.**

Nova Suite is a complete service management solution: a self-service portal with a dynamic request catalog and approvals, an agent console for the full incident and change lifecycle with SLA tracking, a configuration management database with relationship mapping and impact analysis, and an admin platform covering users, roles, organizations, theming, and integrations. It is multi-tenant at the database level using PostgreSQL Row-Level Security, authenticates with JWT and OpenID Connect SSO, and runs workflows on Temporal.

Source: **[github.com/epolus/nova-suite](https://github.com/epolus/nova-suite)**

## Screenshots

![Employee self-service portal](https://raw.githubusercontent.com/epolus/nova-suite/main/docs/screenshots/portal.png)

![Incident detail](https://raw.githubusercontent.com/epolus/nova-suite/main/docs/screenshots/incident-detail.png)

![CMDB configuration item](https://raw.githubusercontent.com/epolus/nova-suite/main/docs/screenshots/cmdb-ci.png)

![Admin workflow editor](https://raw.githubusercontent.com/epolus/nova-suite/main/docs/screenshots/admin-workflow.png)

## Quick start

The whole stack runs from two files, with no need to clone the repository:

```bash
curl -O https://raw.githubusercontent.com/epolus/nova-suite/main/docker-compose.deploy.yml
curl -o .env https://raw.githubusercontent.com/epolus/nova-suite/main/.env.deploy.example

# Fill in the three required secrets: openssl rand -hex 24
$EDITOR .env

docker compose -f docker-compose.deploy.yml up -d
```

The stack bootstraps itself: the database creates its schema, Row-Level Security policies and restricted runtime role on first boot, RS256 session keys are generated into a volume, and pending migrations run before the API starts. Once it settles, the UI is on `http://localhost` and interactive API docs are at `http://localhost/docs`.

To explore with sample data (~500 incidents, ~200 requests, ~80 configuration items), set `NOVA_LOAD_DEMO_DATA=true` before the first start. It only applies while the database is being initialized.

## Understanding the tags

This repository holds **all five components of the stack**, told apart by a tag prefix rather than by separate repositories. A tag looks like `<component>-<version>`:

| Component | Purpose | Ports |
| --- | --- | --- |
| `engine` | Backend REST API. Also contains the schema migrator and the key generator. | 4000 |
| `web` | React SPA — self-service portal and admin console, served by Caddy. | 3000 |
| `worker` | Temporal worker: fulfillment workflows, scheduled imports, email delivery. | none |
| `postgres` | PostgreSQL 18 with the Nova schema, RLS policies and bootstrap scripts baked in. | 5432 |
| `proxy` | Caddy edge proxy with the Nova routing table baked in. | 80, 443 |

For each component you get:

| Tag | Meaning |
| --- | --- |
| `engine-latest` | Latest commit on `main`. Moves often — pin a version for production. |
| `engine-1.4.2` | Exact release. Immutable. |
| `engine-1.4`, `engine-1` | Moving tags following the newest patch / minor in that line. |
| `engine-sha-a1b2c3d` | Exact commit, for traceability. |

There is deliberately **no bare `latest`**, since five different components share the repository. Pin a release by setting a single variable:

```bash
NOVA_TAG=1.4.2
```

Always run every component on the same version. Platform: `linux/amd64`.

## Configuration

Three secrets are required; the stack refuses to start without them. Generate each with `openssl rand -hex 24`:

| Variable | Purpose |
| --- | --- |
| `POSTGRES_PASSWORD` | Bootstrap database superuser, used for schema creation and Temporal setup. |
| `CREDENTIALS_MASTER_KEY` | Encrypts stored tenant credentials. Changing it later makes existing stored credentials undecryptable. |
| `CATALOG_AUTOMATION_SHARED_KEY` | Authenticates internal automation calls between the API and the worker. |

Everything else has a working default. The most commonly changed settings:

| Variable | Default | Notes |
| --- | --- | --- |
| `NOVA_TAG` | `latest` | Pin to a release for production. |
| `HTTP_PORT` / `HTTPS_PORT` | `80` / `443` | Edge proxy ports. |
| `POSTGRES_APP_USER` / `POSTGRES_APP_PASSWORD` | `nova_runtime` | Restricted runtime role used by the API and worker. Must stay `NOSUPERUSER NOBYPASSRLS` — Row-Level Security is the tenant boundary, and a superuser would bypass it. |
| `DB_SCHEMA_VERSION` | `v00.01.00` | Must match the highest applied migration. A mismatch puts the API in degraded mode and stops the worker. |
| `AUTH_LOCAL_LOGIN_ENABLED` | `true` | Set `false` for SSO-only mode. |
| `OIDC_ISSUER` and related | — | OpenID Connect SSO with auto-provisioning. Tested with Google and Microsoft Entra ID. |
| `MAIL_NOTIFICATIONS_ENABLED`, `SMTP_*` | `false` | Email notifications. In-app notifications work without SMTP. |
| `AI_ENABLED` | `false` | Optional AI assistant. Supports OpenAI, Azure OpenAI, and local models via Ollama. |
| `NOVA_LOAD_DEMO_DATA` | `false` | Bulk sample data, applied on first database initialization only. |

The full reference is [`docs/ENVIRONMENT.md`](https://github.com/epolus/nova-suite/blob/main/docs/ENVIRONMENT.md), and [`.env.deploy.example`](https://github.com/epolus/nova-suite/blob/main/.env.deploy.example) is the annotated baseline.

## Volumes

| Volume | Contents |
| --- | --- |
| `pg_data` | Database. Back this up. |
| `nova_secrets` | Generated RS256 session keys. Losing it logs everyone out; the pair is regenerated on next start. |
| `uploads_data` | Attachments. |
| `caddy_data`, `caddy_config` | TLS certificates and proxy state. |

## Security notes before going live

The default configuration is aimed at getting a working instance quickly, so tighten these before exposing an instance:

- The seeded database includes demo accounts (`admin@acme.local` and others, password `admin123`). Change or remove them.
- The published `web` image is built with `VITE_HIDE_DEMO_LOGIN_CREDENTIALS=false`, so the login page shows demo quick-login buttons. These values are compiled into the bundle at build time and cannot be changed with a runtime environment variable — rebuild from source to hide them.
- Point the proxy at a real domain so Caddy can provision TLS automatically.
- Keep the API on the restricted `nova_runtime` role.

## Documentation

[Architecture](https://github.com/epolus/nova-suite/blob/main/docs/ARCHITECTURE.md) · [Environment variables](https://github.com/epolus/nova-suite/blob/main/docs/ENVIRONMENT.md) · [High availability](https://github.com/epolus/nova-suite/blob/main/docs/HIGH_AVAILABILITY.md) · [Upgrade strategy](https://github.com/epolus/nova-suite/blob/main/docs/UPGRADE_STRATEGY.md) · [Operations runbook](https://github.com/epolus/nova-suite/blob/main/docs/OPERATIONS_RUNBOOK.md) · [AI assistant](https://github.com/epolus/nova-suite/blob/main/docs/AI_ASSISTANT.md)

Report issues at [github.com/epolus/nova-suite/issues](https://github.com/epolus/nova-suite/issues).

## License

[AGPL-3.0](https://github.com/epolus/nova-suite/blob/main/LICENSE). If you run a modified version as a network service, you must make your modifications available under the same license.
