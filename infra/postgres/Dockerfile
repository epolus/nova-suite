# ─── Nova Postgres – PostgreSQL 18 with the Nova bootstrap scripts baked in ───
# Published so deployments can pull the stack without cloning the repository.
# Scripts in /docker-entrypoint-initdb.d run once, on an empty data directory only.
FROM postgres:18-alpine

# Runs in lexical order: runtime role, schema, RLS policies, demo data, grants.
COPY infra/postgres/00-runtime-role.sh     /docker-entrypoint-initdb.d/00-runtime-role.sh
COPY infra/postgres/init.sql               /docker-entrypoint-initdb.d/01-init.sql
COPY infra/postgres/rls.sql                /docker-entrypoint-initdb.d/02-rls.sql
COPY infra/postgres/03-demo-data.sh        /docker-entrypoint-initdb.d/03-demo-data.sh
COPY infra/postgres/04-runtime-grants.sql  /docker-entrypoint-initdb.d/04-runtime-grants.sql

# Bulk demo data is opt-in via NOVA_LOAD_DEMO_DATA, so it lives outside initdb.d
# and is loaded by 03-demo-data.sh only when requested.
COPY infra/postgres/03-demo-data.sql /opt/nova/demo-data.sql

RUN chmod +x /docker-entrypoint-initdb.d/00-runtime-role.sh \
             /docker-entrypoint-initdb.d/03-demo-data.sh
