# Nova Suite — Environment Variables

This document is the single source of truth for environment-variable defaults and behavior.
For the complete baseline list, see `.env.example`.

## PostgreSQL roles

| Variable | Who uses it | Notes |
|----------|-------------|--------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | Postgres image init, Temporal auto-setup, `nova-migrate`, backups | Bootstrap **superuser**. Never point the API or worker at this role. |
| `POSTGRES_APP_USER` / `POSTGRES_APP_PASSWORD` | `nova-engine`, `nova-worker` | Default `nova_runtime`. Must be `NOSUPERUSER NOBYPASSRLS`. Created by `infra/postgres/00-runtime-role.sh`. |
| `DB_SCHEMA_VERSION` | `nova-engine`, `nova-worker` | Must match `MAX(version)` in `schema_migrations` after `nova-migrate` (current: `v00.01.47`). Mismatch puts the API in degraded mode and stops the worker. |
| `NOVA_MIGRATIONS_DIR` | `nova-migrate` | Directory of `vNN.NN.NN__slug.sql` files. Defaults to `/app/infra/postgres/migrations` in the engine image. |
| `NOVA_MIGRATE_ACCEPT_CHECKSUMS` | `nova-migrate` | Comma-separated versions whose edited file should be re-recorded instead of stopping the job. One-off repair only; see the forward-only policy in [UPGRADE_STRATEGY.md](./UPGRADE_STRATEGY.md). |
| `DB_POOL_MAX` | `nova-engine` (`nova-worker` outside compose) | Connection pool size per process. Defaults: engine `20`, worker `5`. Keep the sum across all replicas below Postgres `max_connections`. |
| `DB_STATEMENT_TIMEOUT_MS` | `nova-engine`, `nova-worker` | Server-side cap per statement. Defaults: engine `60000`, worker `120000`. `0` disables. In compose the worker's value comes from `WORKER_DB_STATEMENT_TIMEOUT_MS`, so the two can differ. |
| `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` | `nova-engine` | Closes sessions left idle inside a transaction. Default `300000`. |

## Core Variables

```bash
# Temporal
TEMPORAL_ADDRESS=temporal:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=nova-itsm
TEMPORAL_RETENTION_DAYS=30
WORKER_SHUTDOWN_GRACE_MS=20000

# Encrypted tenant credentials (must match between nova-engine and nova-worker)
CREDENTIALS_MASTER_KEY=

# Shared key for internal catalog automation endpoints (must match between nova-engine and nova-worker)
CATALOG_AUTOMATION_SHARED_KEY=

# Identity
NOVA_PRIMARY_TENANT_ID=a0000000-0000-0000-0000-000000000001
BCRYPT_ROUNDS=12
OIDC_ALLOWED_EMAIL_DOMAINS=
SESSION_COOKIE_SECURE=auto
TRUSTED_ORIGINS=

# API uploads
UPLOAD_MAX_FILE_SIZE_MB=20

# Slack / Teams inbound on nova-engine. Slack Events use the webhook signing secret.
# See docs/SLACK_TEAMS.md.
NOVA_INBOUND_WEBHOOK_SECRET=

# Redis (optional cache backend)
REDIS_ENABLED=false
REDIS_URL=redis://redis:6379
REDIS_DEFAULT_TTL_SECONDS=300

# Web (build-time Vite vars)
VITE_DEFAULT_LOCALE=en
VITE_SUPPORTED_LOCALES=en,de,de-ch,fr,it
VITE_LOCALE_STORAGE_KEY=nova_locale
VITE_LOCALE_PREFERENCE_SCOPE=ui:locale
VITE_HIDE_DEMO_LOGIN_CREDENTIALS=false

# AI assistant (nova-engine)
AI_ENABLED=false
AI_DEFAULT_PROVIDER=openai
AI_ESS_ENABLED=true
AI_AGENT_ENABLED=true
OPENAI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1

# Notification mail delivery (nova-worker)
MAIL_NOTIFICATIONS_ENABLED=false
MAIL_FROM=no-reply@nova.local
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
```

## Deployment stack (published images)

These apply to `docker-compose.deploy.yml`, which pulls published images instead of building.
See `.env.deploy.example` for the annotated baseline.

| Variable | Default | Notes |
|----------|---------|--------|
| `NOVA_IMAGE` | `epolus/nova-suite` | Docker Hub repository holding all five components. |
| `NOVA_TAG` | `latest` | Version applied to every component. Tags are prefixed per component (`engine-0.1.5`, `web-0.1.5`, …), so this value is the part after the prefix. Pin a release in production. |
| `NOVA_LOAD_DEMO_DATA` | `false` | Loads the bulk demo dataset (~500 incidents, ~200 requests, ~80 CIs) during **database initialization only**. Ignored on an existing volume. |
| `HTTP_PORT` / `HTTPS_PORT` | `80` / `443` | Host ports published by the edge proxy. |
| `TEMPORAL_UI_PORT` | `8080` | Temporal UI, published on `127.0.0.1` only (no auth). Reach it with `ssh -L 8080:127.0.0.1:8080 <host>`. |

`POSTGRES_PASSWORD`, `CREDENTIALS_MASTER_KEY` and `CATALOG_AUTOMATION_SHARED_KEY` are declared
required in that file, so Compose fails with a named error rather than starting on a placeholder.

## Behavior Notes

- **Startup validation (engine)** — numbers, `true`/`false` flags, enums (`NODE_ENV`, `LOG_LEVEL`, `AI_DEFAULT_PROVIDER`), URLs, `NOVA_PRIMARY_TENANT_ID`, `DB_SCHEMA_VERSION`, OIDC client settings and `CREDENTIALS_MASTER_KEY` length are checked when `nova-engine` starts. Any invalid value stops startup with a list of every problem. Empty values count as unset and use the default.
- **`WORKER_SHUTDOWN_GRACE_MS`** — on SIGTERM the worker stops polling and gives in-flight activities this long (default `20000`) to finish before cancelling them. Keep the container stop timeout above this value plus 10 seconds (compose sets `stop_grace_period: 40s`). Data source imports cancelled this way resume at their last committed chunk on retry.

- **JWT keys in the deployment stack** — the `nova-keygen` one-shot service runs
  `node packages/nova-engine/dist/ensure-jwt-keys.js` before the API starts and writes an RS256
  pair into the `nova_secrets` volume at `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH`. It never
  overwrites existing keys, and aborts if only one half of the pair is present rather than
  issuing tokens the API cannot verify. Deleting the volume invalidates every active session.
  Inline `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` take precedence and skip generation entirely.

- **`CREDENTIALS_MASTER_KEY`** — symmetric passphrase for PostgreSQL `pgp_sym_encrypt` / `pgp_sym_decrypt` on the `tenant_credentials` table. Must be identical on **nova-engine** (create/list credentials, data source **Test connection**) and **nova-worker** (catalog `{{cred.slug}}`, scheduled imports using `credential_slug`). Use a long random string (≥16 characters). If unset or too short, vault writes and runtime decryption fail.
- **`CATALOG_AUTOMATION_SHARED_KEY`** — shared secret used by internal catalog automation endpoints under `/api/catalog/automation/*` (for example the demo add-support-group-member endpoint) and by in-flow HTTP steps created by catalog automation. Must be identical on **nova-engine** and **nova-worker**. If missing/mismatched, automated tasks can fail with HTTP `401 Invalid automation key` or `503 Catalog automation key is not configured`. Deploy schema `v00.01.23` before engine/worker builds that use `migration_runs` or `request_tasks.parent_task_id` / `automation_checkpoint`.

- **`TEMPORAL_RETENTION_DAYS`** is the app’s configured retention (shown in Admin → Workflows as “App setting”). It does **not** change an already-created Temporal namespace by itself.
- **`DEFAULT_NAMESPACE_RETENTION`** is read by `temporalio/auto-setup` when it **first registers** the default namespace (Go duration, e.g. `720h` for 30 days). Defaults to **720h** in `docker-compose.yml` so it matches `TEMPORAL_RETENTION_DAYS=30`. If you changed retention days, set this to `(days)×24` hours (e.g. `14d` → `336h`).
- **Existing deployments** whose namespace was created with the stock **24h** retention must update the namespace once, for example:
  `docker compose exec temporal temporal operator namespace update default --retention 720h`
  (adjust `720h` to match your policy).
- **GET `/api/temporal/overview`** returns **`retentionDaysServer`** (actual namespace TTL), **`retentionDaysConfigured`** (`TEMPORAL_RETENTION_DAYS`), and **`retentionDays`** (server value, or configured if server metadata is missing).
- **Mail notifications rollout controls (worker):**
  - `MAIL_NOTIFICATIONS_ENABLED=false` keeps email dispatch disabled while still allowing in-app notifications.
  - Set `SMTP_HOST` and related SMTP credentials before enabling mail delivery.
  - `MAIL_FROM` sets the sender identity for outbound notification mail.
- Redis caching is optional; when enabled, `GET /api/settings/theme` and `GET /api/settings` are cached and invalidated on settings update/logo change.
- Cache telemetry endpoint: `GET /api/settings/cache/metrics` (admin only) reports hits/misses/errors and connection status.
- `VITE_*` values are injected at frontend build time; rebuild `nova-web` after changing them.
- **`VITE_HIDE_DEMO_LOGIN_CREDENTIALS`** — when `true`, hides the demo quick-login buttons (Admin / Fulfiller / User) on the login page. Default is `false` (shown). Set to `true` in production deployments.
- **AI assistant** — see [AI_ASSISTANT.md](./AI_ASSISTANT.md). Set `AI_ENABLED=true` and configure `OPENAI_*`, Azure OpenAI, or `OLLAMA_*`. ESS/agent toggles: `AI_ESS_ENABLED`, `AI_AGENT_ENABLED`.
- **Slack and Teams** — see [SLACK_TEAMS.md](./SLACK_TEAMS.md). `NOVA_INBOUND_WEBHOOK_SECRET` authenticates non-Slack callers of `POST /api/webhooks/inbound/chat` and alert ingest at `POST /api/webhooks/inbound/events` for the **primary tenant only**; other tenants must configure their own secret. Leave it empty until you connect a channel. Do not store that secret in tenant settings.
- **`NOVA_PRIMARY_TENANT_ID`** — the tenant this install serves. Password login and SSO only resolve users in this tenant, and the public theme endpoint reads its branding. Defaults to the seeded tenant `a0000000-0000-0000-0000-000000000001`; must be a UUID.
- **`OIDC_ALLOWED_EMAIL_DOMAINS`** — comma-separated, exact-match email domains (e.g. `example.com,example.ch`). An SSO login that is not yet linked to a user is accepted only when the IdP email is in one of these domains and `email_verified` is not `false`; it then links to the existing user with that email (only if that user has no other SSO link) or provisions a new one. **Empty means no new SSO users or links** — already-linked users keep working. Subdomains must be listed explicitly.
- **`BCRYPT_ROUNDS`** — bcrypt cost for password hashes (default `12`). Existing hashes with a lower cost are re-hashed on the next successful login. Higher values slow down login and bulk user import.
- **Sessions** — the web app is signed in through the httpOnly cookie `nova_session`, valid for `JWT_EXPIRES_IN` and backed by a `user_sessions` row that logout, deactivation, admin lock and admin password reset revoke. API scripts keep using `Authorization: Bearer` with the `token` from `POST /api/auth/login`.
- **`SESSION_COOKIE_SECURE`** — `auto` (default) marks the cookie `Secure` when the request reached the engine over HTTPS, which relies on a correct `TRUST_PROXY`. Set `true` if TLS ends at a proxy that does not send `X-Forwarded-Proto`; `false` only for plain-HTTP test setups.
- **`TRUSTED_ORIGINS`** — comma-separated origins (`https://portal.example.com`) besides the API's own host that may make cookie-authenticated `POST`/`PUT`/`PATCH`/`DELETE` calls. Leave empty when the UI and `/api` share one host (the default stack).
- **Event management** — see [EVENT_MANAGEMENT.md](./EVENT_MANAGEMENT.md).
