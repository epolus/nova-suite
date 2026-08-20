#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Load the bulk demo dataset (~500 incidents, ~200 requests, ~80 CIs) only when
# explicitly requested. Published images ship without it so a fresh deployment
# starts on an empty tenant.
set -eu

DEMO_SQL="${NOVA_DEMO_DATA_FILE:-/opt/nova/demo-data.sql}"

case "${NOVA_LOAD_DEMO_DATA:-false}" in
  1 | true | TRUE | True | yes | YES) ;;
  *)
    echo "03-demo-data.sh: skipping demo data (set NOVA_LOAD_DEMO_DATA=true to load it)"
    exit 0
    ;;
esac

if [ ! -f "$DEMO_SQL" ]; then
  echo "03-demo-data.sh: NOVA_LOAD_DEMO_DATA is set but $DEMO_SQL is missing" >&2
  exit 1
fi

echo "03-demo-data.sh: loading demo data from $DEMO_SQL"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$DEMO_SQL"
