# Operations Runbook

This runbook covers production backup/restore and secret rotation validation for Nova Suite.

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

### JWT signing secret
- Generate a new random value (>=32 chars).
- Roll out `JWT_SECRET` on API nodes.
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

