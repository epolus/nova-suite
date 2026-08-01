#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-nova}"
POSTGRES_USER="${POSTGRES_USER:-nova_app}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-changeme}"

echo "Restoring ${BACKUP_FILE} into ${POSTGRES_DB} on ${POSTGRES_HOST}:${POSTGRES_PORT}"
gunzip -c "${BACKUP_FILE}" | PGPASSWORD="${POSTGRES_PASSWORD}" psql \
  --host="${POSTGRES_HOST}" \
  --port="${POSTGRES_PORT}" \
  --username="${POSTGRES_USER}" \
  --dbname="${POSTGRES_DB}" \
  --single-transaction \
  --set ON_ERROR_STOP=1

echo "Restore completed."
