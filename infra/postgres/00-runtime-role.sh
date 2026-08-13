#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Create the non-superuser, non-BYPASSRLS role that nova-engine and nova-worker
# must connect as. Superusers ignore FORCE ROW LEVEL SECURITY, so the bootstrap
# role (POSTGRES_USER) must never be used by the application.
set -eu

APP_USER="${POSTGRES_APP_USER:-nova_runtime}"
APP_PASSWORD="${POSTGRES_APP_PASSWORD:-${POSTGRES_PASSWORD:-}}"

if [ -z "$APP_PASSWORD" ]; then
  echo "00-runtime-role.sh: POSTGRES_APP_PASSWORD or POSTGRES_PASSWORD must be set" >&2
  exit 1
fi

sql_literal() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/''/g")"
}

USER_LIT=$(sql_literal "$APP_USER")
PASS_LIT=$(sql_literal "$APP_PASSWORD")

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
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
