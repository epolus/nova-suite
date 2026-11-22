#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Apply the same init sequence as infra/postgres docker-entrypoint-initdb.d
# against a plain Postgres service (GitHub Actions does not mount those scripts).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGHOST="${POSTGRES_HOST:-localhost}"
PGPORT="${POSTGRES_PORT:-5432}"
PGDATABASE="${POSTGRES_DB:-nova}"
PGUSER="${POSTGRES_USER:-nova_app}"
export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

APP_USER="${POSTGRES_APP_USER:-nova_runtime}"
APP_PASSWORD="${POSTGRES_APP_PASSWORD:-$POSTGRES_PASSWORD}"

sql_literal() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/''/g")"
}

psql_app() {
  psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" "$@"
}

if ! command -v psql >/dev/null 2>&1; then
  echo "[ci-postgres] psql not found; install postgresql-client" >&2
  exit 1
fi

echo "[ci-postgres] waiting for ${PGHOST}:${PGPORT}/${PGDATABASE}"
ready=0
for _ in $(seq 1 60); do
  if psql_app -c 'SELECT 1' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "[ci-postgres] Postgres did not become ready in time" >&2
  exit 1
fi

USER_LIT=$(sql_literal "$APP_USER")
PASS_LIT=$(sql_literal "$APP_PASSWORD")

echo "[ci-postgres] creating runtime role ${APP_USER}"
psql_app <<EOSQL
DO \$\$
DECLARE
  r name := ${USER_LIT};
  p text := ${PASS_LIT};
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
    EXECUTE format(
      'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
      r, p
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
      r, p
    );
  END IF;
END
\$\$;
EOSQL

echo "[ci-postgres] applying init.sql"
psql_app -f "$ROOT/infra/postgres/init.sql"

echo "[ci-postgres] applying rls.sql"
psql_app -f "$ROOT/infra/postgres/rls.sql"

echo "[ci-postgres] applying 04-runtime-grants.sql"
psql_app -f "$ROOT/infra/postgres/04-runtime-grants.sql"

echo "[ci-postgres] bootstrap complete"
