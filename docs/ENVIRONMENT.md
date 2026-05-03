# Nova Suite — Environment Variables

This document is the single source of truth for environment-variable defaults and behavior.
For the complete baseline list, see `.env.example`.

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

# Web i18n (build-time Vite vars)
VITE_DEFAULT_LOCALE=en
VITE_SUPPORTED_LOCALES=en,de,de-ch,fr,it
VITE_LOCALE_STORAGE_KEY=nova_locale
VITE_LOCALE_PREFERENCE_SCOPE=ui:locale

# Notification mail delivery (nova-worker)
MAIL_NOTIFICATIONS_ENABLED=false
MAIL_FROM=no-reply@nova.local
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
```

## Behavior Notes

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
