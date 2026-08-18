# Operations Runbook

This runbook covers production backup/restore and secret rotation validation for Nova Suite.

## 0. Runtime database role (RLS)

`nova-engine` and `nova-worker` must connect as `nova_runtime` (`POSTGRES_APP_USER`), not as the Postgres bootstrap superuser (`POSTGRES_USER`). Superusers silently bypass `FORCE ROW LEVEL SECURITY`.

- Created on first Postgres init by `infra/postgres/00-runtime-role.sh` and `04-runtime-grants.sql`.
- Both processes exit on boot if the connected role is superuser or `BYPASSRLS`.

## 0.1 Schema migrations

`nova-migrate` is a one-shot Compose service. It connects as `POSTGRES_USER` (`nova_app`) and applies pending files from `infra/postgres/migrations/`. API and worker must not run DDL.

- Engine and worker wait until this job exits 0 (`service_completed_successfully`).
- Expected schema is `DB_SCHEMA_VERSION` (must match the latest numbered file).
- A missing `schema_migrations` table is a hard failure, not a repair case.

## 1. Database Backup

- Create a full logical backup with:
  - `./scripts/backup_postgres.sh`
- Optional custom values:
  - `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
  - `BACKUP_DIR` (default: `./backups`)
- Output format:
  - compressed SQL dump: `nova_YYYYMMDD_HHMMSS.sql.gz`

## 2. Restore Drill

- Restore into a non-production environment first:
  - `./scripts/restore_postgres.sh /path/to/nova_YYYYMMDD_HHMMSS.sql.gz`
- Verify:
  - login works for local and SSO users
  - core entities load (`incidents`, `requests`, `changes`, `problems`, `configuration_items`)
  - worker heartbeat appears in `/health` after worker startup

## 3. Secret Rotation

### JWT signing keys (RS256)
- Generate a new RSA key pair (`./scripts/generate-jwt-keys.sh`, or openssl).
- Roll out `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` (or `*_PATH`) on API nodes.
- Restart API instances with rolling strategy.
- Existing sessions are expected to require re-authentication.

### Credentials and automation shared keys
- Rotate both:
  - `CREDENTIALS_MASTER_KEY`
  - `CATALOG_AUTOMATION_SHARED_KEY`
- Apply the same values to API and worker.
- Restart both services.

### Validate after rotation
- Run:
  - `./scripts/verify_secret_rotation.sh`
- The script verifies required secrets are present and not weak defaults.

