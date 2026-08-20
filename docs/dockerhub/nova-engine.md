# Nova Engine

**Backend REST API for [Nova Suite](https://github.com/epolus/nova-suite) — an open-source IT Service Management (ITSM) platform.**

Nova Engine is the API tier: service catalog, incidents, changes, problems, knowledge base, CMDB, approvals, admin configuration, and an optional AI assistant. It is multi-tenant by design, using PostgreSQL Row-Level Security for tenant isolation, and stateless (JWT auth) so it scales horizontally.

This image also ships the database migrator and the bundled SQL migrations, so the same artifact runs both the API and the schema upgrade.

## Tags

| Tag | Meaning |
| --- | --- |
| `latest` | Latest commit on `main`. Moves often — pin a version for production. |
| `1.4.2` | Exact release. Immutable. |
| `1.4`, `1` | Moving tags that follow the newest patch / minor in that line. |
| `sha-<short>` | Exact commit, for traceability. |

Platform: `linux/amd64`.

## Quick start

Nova Engine needs PostgreSQL and (for workflow features) Temporal. The fastest path is the Compose stack from the repository, which wires up Postgres, Temporal, the worker, the frontend, and a Caddy reverse proxy:

```bash
git clone https://github.com/epolus/nova-suite
cd nova-suite
./scripts/setup.sh      # generates .env, random secrets, and RS256 JWT keys
docker compose up -d
curl http://localhost:4000/health
```

Interactive API documentation (Swagger UI) is served at `/docs`.

## Running the container directly

```bash
docker run -d --name nova-engine \
  -p 4000:4000 \
  -e POSTGRES_HOST=postgres \
  -e POSTGRES_DB=nova \
  -e POSTGRES_APP_USER=nova_runtime \
  -e POSTGRES_APP_PASSWORD=<runtime-password> \
  -e DB_SCHEMA_VERSION=v00.01.00 \
  -e CREDENTIALS_MASTER_KEY=<long-random-string> \
  -e CATALOG_AUTOMATION_SHARED_KEY=<long-random-string> \
  -v ./secrets:/secrets:ro \
  -v nova_uploads:/data/uploads \
  epolus/nova-engine:latest
```

- Port `4000` (HTTP API)
- Runs as non-root user `nova` (uid 1001)
- `HEALTHCHECK` polls `GET /health`
- Default command: `node packages/nova-engine/dist/index.js`

### Run migrations first

Schema migrations run as a separate one-shot container from the **same image**, using the bootstrap Postgres role rather than the restricted runtime role:

```bash
docker run --rm \
  -e POSTGRES_HOST=postgres \
  -e POSTGRES_DB=nova \
  -e POSTGRES_USER=nova_app \
  -e POSTGRES_PASSWORD=<bootstrap-password> \
  epolus/nova-engine:latest \
  node packages/nova-engine/dist/migrate.js
```

## Configuration

The full reference is [`docs/ENVIRONMENT.md`](https://github.com/epolus/nova-suite/blob/main/docs/ENVIRONMENT.md); `.env.example` is the baseline. The essentials:

### Database

| Variable | Default | Notes |
| --- | --- | --- |
| `POSTGRES_HOST` / `POSTGRES_PORT` | — / `5432` | PostgreSQL 18 expected. |
| `POSTGRES_DB` | `nova` | |
| `POSTGRES_APP_USER` / `POSTGRES_APP_PASSWORD` | `nova_runtime` | Runtime role. Must be `NOSUPERUSER NOBYPASSRLS` — Row-Level Security is the tenant boundary. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | — | Bootstrap superuser, used **only** by the migrator. Never point the API at this role. |
| `DB_SCHEMA_VERSION` | `v00.01.00` | Must match the highest applied migration. A mismatch puts the API into degraded mode. |

### Authentication

| Variable | Default | Notes |
| --- | --- | --- |
| `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH` | `/secrets/jwt-private.pem`, `/secrets/jwt-public.pem` | RS256 key pair. Generate with `./scripts/generate-jwt-keys.sh` or `openssl genrsa`. |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | — | Inline PEM alternative to the path variables. |
| `JWT_EXPIRES_IN` | `8h` | |
| `AUTH_LOCAL_LOGIN_ENABLED` | `true` | Set `false` for SSO-only mode. |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI` | — | OpenID Connect SSO with auto-provisioning. Works with Google, Microsoft Entra ID, and other OIDC providers. |

### Workflows and shared secrets

| Variable | Default | Notes |
| --- | --- | --- |
| `TEMPORAL_ADDRESS` | `temporal:7233` | |
| `TEMPORAL_NAMESPACE` / `TEMPORAL_TASK_QUEUE` | `default` / `nova-itsm` | |
| `CREDENTIALS_MASTER_KEY` | — | Encrypts stored tenant credentials. **Must be identical** on `nova-engine` and `nova-worker`. Use ≥16 random characters. |
| `CATALOG_AUTOMATION_SHARED_KEY` | — | Shared secret for internal catalog automation endpoints. **Must be identical** on `nova-engine` and `nova-worker`. |

### Optional

| Variable | Default | Notes |
| --- | --- | --- |
| `AI_ENABLED` | `false` | Enables the AI assistant. Then set `AI_DEFAULT_PROVIDER` (`openai`, `azure_openai`, or `ollama`) and the matching credentials. |
| `REDIS_ENABLED` / `REDIS_URL` | `false` / `redis://redis:6379` | Optional cache for settings and theme lookups. |
| `UPLOAD_DIR` / `UPLOAD_MAX_FILE_SIZE_MB` | `/data/uploads` / `20` | Attachment storage. Mount a volume to persist. |
| `TRUST_PROXY` | `1` | Set when running behind a reverse proxy. |
| `LOG_LEVEL` | `info` | Structured JSON logs (Pino). |

## Volumes

| Path | Purpose |
| --- | --- |
| `/data/uploads` | Attachment storage. Mount a volume or attachments are lost on restart. |
| `/secrets` | JWT key pair, mounted read-only. |

## Related images

- [`epolus/nova-web`](https://hub.docker.com/r/epolus/nova-web) — React admin dashboard and self-service portal
- [`epolus/nova-worker`](https://hub.docker.com/r/epolus/nova-worker) — Temporal worker for workflows and scheduled imports

Run all three at the same version.

## Documentation and source

- Source: [github.com/epolus/nova-suite](https://github.com/epolus/nova-suite)
- [Architecture](https://github.com/epolus/nova-suite/blob/main/docs/ARCHITECTURE.md) · [Environment variables](https://github.com/epolus/nova-suite/blob/main/docs/ENVIRONMENT.md) · [High availability](https://github.com/epolus/nova-suite/blob/main/docs/HIGH_AVAILABILITY.md) · [Upgrades](https://github.com/epolus/nova-suite/blob/main/docs/UPGRADE_STRATEGY.md) · [Operations runbook](https://github.com/epolus/nova-suite/blob/main/docs/OPERATIONS_RUNBOOK.md)
- Report issues: [github.com/epolus/nova-suite/issues](https://github.com/epolus/nova-suite/issues)

## License

[AGPL-3.0](https://github.com/epolus/nova-suite/blob/main/LICENSE). If you run a modified version as a network service, you must make your modifications available under the same license.
