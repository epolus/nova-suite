# Nova Suite — Environment Variables

This document is the single source of truth for environment-variable defaults and behavior.
For the complete baseline list, see `.env.example`.

## PostgreSQL roles

| Variable | Who uses it | Notes |
|----------|-------------|--------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | Postgres image init, Temporal auto-setup, `nova-migrate`, backups | Bootstrap **superuser**. Never point the API or worker at this role. |
| `POSTGRES_APP_USER` / `POSTGRES_APP_PASSWORD` | `nova-engine`, `nova-worker` | Default `nova_runtime`. Must be `NOSUPERUSER NOBYPASSRLS`. Created by `infra/postgres/00-runtime-role.sh`. |
| `DB_SCHEMA_VERSION` | `nova-engine`, `nova-worker` | Must match `MAX(version)` in `schema_migrations` after `nova-migrate` (current: `v00.01.02`). Mismatch puts the API in degraded mode and stops the worker. |
| `NOVA_MIGRATIONS_DIR` | `nova-migrate` | Directory of `vNN.NN.NN__slug.sql` files. Defaults to `/app/infra/postgres/migrations` in the engine image. |

## Core Variables

```bash
# Temporal
TEMPORAL_ADDRESS=temporal:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=nova-itsm
TEMPORAL_RETENTION_DAYS=30

# Encrypted tenant credentials (must match between nova-engine and nova-worker)
CREDENTIALS_MASTER_KEY=

# Shared key for internal catalog automation endpoints (must match between nova-engine and nova-worker)
CATALOG_AUTOMATION_SHARED_KEY=

# API uploads
UPLOAD_MAX_FILE_SIZE_MB=20

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
| `NOVA_TAG` | `latest` | Version applied to every component. Tags are prefixed per component (`engine-0.1.2`, `web-0.1.2`, …), so this value is the part after the prefix. Pin a release in production. |
| `NOVA_LOAD_DEMO_DATA` | `false` | Loads the bulk demo dataset (~500 incidents, ~200 requests, ~80 CIs) during **database initialization only**. Ignored on an existing volume. |
| `HTTP_PORT` / `HTTPS_PORT` | `80` / `443` | Host ports published by the edge proxy. |

`POSTGRES_PASSWORD`, `CREDENTIALS_MASTER_KEY` and `CATALOG_AUTOMATION_SHARED_KEY` are declared
required in that file, so Compose fails with a named error rather than starting on a placeholder.

## Behavior Notes

- **JWT keys in the deployment stack** — the `nova-keygen` one-shot service runs
  `node packages/nova-engine/dist/ensure-jwt-keys.js` before the API starts and writes an RS256
  pair into the `nova_secrets` volume at `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH`. It never
  overwrites existing keys, and aborts if only one half of the pair is present rather than
  issuing tokens the API cannot verify. Deleting the volume invalidates every active session.
  Inline `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` take precedence and skip generation entirely.

- **`CREDENTIALS_MASTER_KEY`** — symmetric passphrase for PostgreSQL `pgp_sym_encrypt` / `pgp_sym_decrypt` on the `tenant_credentials` table. Must be identical on **nova-engine** (create/list credentials, data source **Test connection**) and **nova-worker** (catalog `{{cred.slug}}`, scheduled imports using `credential_slug`). Use a long random string (≥16 characters). If unset or too short, vault writes and runtime decryption fail.
- **`CATALOG_AUTOMATION_SHARED_KEY`** — shared secret used by internal catalog automation endpoints under `/api/catalog/automation/*` (for example the demo add-support-group-member endpoint). Must be identical on **nova-engine** and **nova-worker**. If missing/mismatched, automated tasks can fail with HTTP `401 Invalid automation key` or `503 Catalog automation key is not configured`.

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
