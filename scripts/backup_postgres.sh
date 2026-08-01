#!/usr/bin/env bash
set -euo pipefail

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-nova}"
POSTGRES_USER="${POSTGRES_USER:-nova_app}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-changeme}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

mkdir -p "${BACKUP_DIR}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="${BACKUP_DIR}/nova_${STAMP}.sql.gz"

echo "Creating backup at ${OUT_FILE}"
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  --host="${POSTGRES_HOST}" \
  --port="${POSTGRES_PORT}" \
  --username="${POSTGRES_USER}" \
  --dbname="${POSTGRES_DB}" \
  --no-owner \
  --no-privileges \
  | gzip -9 > "${OUT_FILE}"

echo "Backup completed: ${OUT_FILE}"
