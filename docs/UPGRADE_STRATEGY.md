# Nova Suite — Upgrade Strategy

## Zero-Downtime Upgrade Principles

1. **Database migrations run before code deploys** — `nova-migrate` must finish before `nova-engine` / `nova-worker` start
2. **Migrations must be backward-compatible** — old code must still work after migration
3. **Rolling deploys** — replace instances one at a time
4. **Health checks gate traffic** — unhealthy instances are removed from rotation

## Database Migration Strategy

Empty Postgres volumes are created by [`infra/postgres/init.sql`](../infra/postgres/init.sql) and [`infra/postgres/rls.sql`](../infra/postgres/rls.sql) (`docker-entrypoint-initdb.d`). That seeds `schema_migrations` at `v00.01.00`. Those files **do not re-run** on an existing volume.

Later schema changes are numbered SQL files under `infra/postgres/migrations/` (`vNN.NN.NN__slug.sql`). That folder is empty at `v00.01.00`: the job is the mechanism for **future** changes, not a replay of P0.1–P0.3.

`nova-migrate` (compose one-shot, same image as the engine, command `node packages/nova-engine/dist/migrate.js`) connects as `POSTGRES_USER` (`nova_app`), applies any file whose version is greater than the ledger, then exits. Engine and worker wait on `service_completed_successfully` and keep using `POSTGRES_APP_USER` (`nova_runtime`).

### Migration Ledger Contract

```sql
CREATE TABLE schema_migrations (
  version     text PRIMARY KEY,
  name        text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
```

- Filename pattern: `vNN.NN.NN__slug.sql` (example: `v00.01.01__add_request_due_date.sql`).
- One file per version. Duplicate versions fail the job.
- Each successful file inserts exactly one ledger row. SQL error rolls back that file and exits non-zero.
- API and worker compare `MAX(version)` with `DB_SCHEMA_VERSION`. Mismatch → degraded health; worker will not poll workflows.
- If `schema_migrations` is missing, the job fails. It does not repair an unknown database.

### Version Bump Workflow

1. Update `init.sql` / `rls.sql` so a **wiped** volume is current. Those files stay CREATE-only (`DROP POLICY` belongs in the numbered file, not in `rls.sql`).
2. Add `infra/postgres/migrations/vNN.NN.NN__slug.sql` with the incremental DDL (idempotent when replacing a policy).
3. Set `DB_SCHEMA_VERSION=vNN.NN.NN` in `.env.example`, engine/worker defaults, and compose.
4. Deploy: Postgres healthy → `nova-migrate` → engine/worker.
5. Verify `/health` and `/api/admin/runtime-health` report schema as `compatible`.

### Backward-Compatible Changes

**Safe changes (no coordination needed):**
- Add a new table
- Add a nullable column
- Add an index
- Add a new enum value

**Requires multi-step deployment:**
- Rename a column → add new, copy data, update code, drop old
- Change column type → add new, dual-write, migrate reads, drop old
- Remove a column → stop reading first, then drop

### Example: Adding a Column

```sql
-- infra/postgres/migrations/v00.01.01__request_due_date.sql
ALTER TABLE requests ADD COLUMN due_date timestamptz;

UPDATE requests r
SET due_date = r.created_at + (si.sla_hours || ' hours')::interval
FROM service_items si
WHERE si.id = r.service_item_id
  AND r.due_date IS NULL;
```

Also add the same column to `init.sql`. Deploy this migration, then deploy the code that uses `due_date`.

## Deployment Strategies

### Blue-Green Deployment

Run two identical environments (blue and green). Only one serves traffic at a time.

```
                     ┌──────────────┐
     Traffic ───────▶│ Load Balancer│
                     └──────┬───────┘
                            │
               ┌────────────┼────────────┐
               ▼                         ▼
       ┌───────────┐              ┌───────────┐
       │  Blue     │              │  Green    │
       │ (current) │              │ (new ver) │
       └───────────┘              └───────────┘
```

1. Deploy new version to the inactive environment
2. Run migrations (both versions compatible)
3. Run smoke tests against the inactive environment
4. Switch the load balancer
5. Monitor for issues
6. Roll back by switching the load balancer back

### Canary Deployment

Route a small percentage of traffic to the new version.

```bash
# Docker Swarm: deploy 1 new instance alongside 4 old ones
docker service update --image nova-suite/engine:v2 \
  --update-parallelism 1 \
  --update-delay 60s \
  nova_nova-engine
```

```yaml
# Kubernetes: use a canary deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nova-engine-canary
spec:
  replicas: 1  # Just 1 canary instance
  selector:
    matchLabels:
      app: nova-engine
      track: canary
  template:
    spec:
      containers:
        - name: nova-engine
          image: nova-suite/engine:v2
```

## Rollback Procedure

### Immediate Rollback (Code)

```bash
# Docker Swarm
docker service update --rollback nova_nova-engine

# Kubernetes
kubectl rollout undo deployment/nova-engine -n nova-suite
```

### Database Rollback

If a migration must be reversed:

1. Deploy a new **forward** migration that undoes the change
2. Never use `DROP` in a rollback — always add/modify
3. Example: if you added a NOT NULL constraint, add a migration to remove it

## Pre-Deploy Checklist

- [ ] All migrations are backward-compatible
- [ ] Migrations tested against a copy of production data
- [ ] Health check endpoint returns correctly on new version
- [ ] Smoke tests pass against the new version
- [ ] Rollback plan documented and tested
- [ ] Team notified of deployment window
- [ ] Monitoring dashboards open

## Post-Deploy Verification

```bash
# Check health
curl https://nova.example.com/health

# Verify API version
curl https://nova.example.com/health | jq .version

# Run smoke tests
curl -X POST https://nova.example.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email": "admin@acme.local", "password": "admin123"}'

# Check error rates in logs
docker service logs nova_nova-engine --since 5m | grep ERROR
```
