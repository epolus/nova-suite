# Nova Worker

**Temporal worker for [Nova Suite](https://github.com/epolus/nova-suite) — an open-source IT Service Management (ITSM) platform.**

Nova Worker executes the asynchronous side of Nova Suite: request fulfillment and approval workflows, catalog task automation (outbound HTTP calls with encrypted tenant credentials), scheduled data-source imports from REST/CSV/database sources, major-incident coordination, and email notification delivery.

It polls a Temporal task queue and has no inbound network surface — no ports are exposed.

## Tags

| Tag | Meaning |
| --- | --- |
| `latest` | Latest commit on `main`. Moves often — pin a version for production. |
| `1.4.2` | Exact release. Immutable. |
| `1.4`, `1` | Moving tags that follow the newest patch / minor in that line. |
| `sha-<short>` | Exact commit, for traceability. |

Platform: `linux/amd64`. Based on `node:24-slim` (Debian) because the Temporal SDK's native core requires glibc.

## Quick start

The worker is not useful standalone — it needs PostgreSQL, Temporal, and Nova Engine. Use the Compose stack from the repository:

```bash
git clone https://github.com/epolus/nova-suite
cd nova-suite
./scripts/setup.sh
docker compose up -d
```

Workflow executions are visible in the Temporal UI at `http://localhost:8080`, and in the app under **Admin → Workflows**.

## Running the container directly

```bash
docker run -d --name nova-worker \
  -e POSTGRES_HOST=postgres \
  -e POSTGRES_DB=nova \
  -e POSTGRES_APP_USER=nova_runtime \
  -e POSTGRES_APP_PASSWORD=<runtime-password> \
  -e DB_SCHEMA_VERSION=v00.01.00 \
  -e TEMPORAL_ADDRESS=temporal:7233 \
  -e CREDENTIALS_MASTER_KEY=<same-value-as-engine> \
  -e CATALOG_AUTOMATION_SHARED_KEY=<same-value-as-engine> \
  epolus/nova-worker:latest
```

- No exposed ports
- Runs as non-root user `nova` (uid 1001)
- Default command: `node packages/nova-worker/dist/worker.js`

Scale by running more replicas against the same task queue.

## Configuration

The full reference is [`docs/ENVIRONMENT.md`](https://github.com/epolus/nova-suite/blob/main/docs/ENVIRONMENT.md). The essentials:

### Database

| Variable | Default | Notes |
| --- | --- | --- |
| `POSTGRES_HOST` / `POSTGRES_PORT` | — / `5432` | |
| `POSTGRES_DB` | `nova` | |
| `POSTGRES_APP_USER` / `POSTGRES_APP_PASSWORD` | `nova_runtime` | Restricted runtime role, same as the engine uses. Must be `NOSUPERUSER NOBYPASSRLS`. |
| `DB_SCHEMA_VERSION` | `v00.01.00` | Must match the highest applied migration. **On mismatch the worker stops** rather than operating against an unexpected schema. |

### Temporal

| Variable | Default | Notes |
| --- | --- | --- |
| `TEMPORAL_ADDRESS` | `temporal:7233` | gRPC endpoint. |
| `TEMPORAL_NAMESPACE` | `default` | |
| `TEMPORAL_TASK_QUEUE` | `nova-itsm` | Must match the engine's queue or work is never picked up. |
| `TEMPORAL_RETENTION_DAYS` | `30` | The app's configured retention. Changing it does not retroactively alter an existing Temporal namespace — see the environment docs. |

### Shared secrets

Both values **must be byte-identical** to the ones set on `nova-engine`, or automation and credential decryption fail at runtime:

| Variable | Notes |
| --- | --- |
| `CREDENTIALS_MASTER_KEY` | Decrypts tenant credentials for catalog automation (`{{cred.slug}}`) and scheduled imports. Use ≥16 random characters. |
| `CATALOG_AUTOMATION_SHARED_KEY` | Authenticates calls to the engine's internal `/api/catalog/automation/*` endpoints. A mismatch surfaces as HTTP `401 Invalid automation key`. |

### Email notifications

Disabled by default; in-app notifications still work without SMTP.

| Variable | Default |
| --- | --- |
| `MAIL_NOTIFICATIONS_ENABLED` | `false` |
| `MAIL_FROM` | `no-reply@nova.local` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | — / `587` / `false` |
| `SMTP_USER` / `SMTP_PASS` | — |

## Related images

- [`epolus/nova-engine`](https://hub.docker.com/r/epolus/nova-engine) — backend REST API and database migrator
- [`epolus/nova-web`](https://hub.docker.com/r/epolus/nova-web) — React admin dashboard and self-service portal

Run all three at the same version.

## Documentation and source

- Source: [github.com/epolus/nova-suite](https://github.com/epolus/nova-suite)
- [Catalog task automation](https://github.com/epolus/nova-suite/blob/main/docs/CATALOG_TASK_AUTOMATION.md) · [Environment variables](https://github.com/epolus/nova-suite/blob/main/docs/ENVIRONMENT.md) · [Architecture](https://github.com/epolus/nova-suite/blob/main/docs/ARCHITECTURE.md) · [Operations runbook](https://github.com/epolus/nova-suite/blob/main/docs/OPERATIONS_RUNBOOK.md)
- Report issues: [github.com/epolus/nova-suite/issues](https://github.com/epolus/nova-suite/issues)

## License

[AGPL-3.0](https://github.com/epolus/nova-suite/blob/main/LICENSE). If you run a modified version as a network service, you must make your modifications available under the same license.
