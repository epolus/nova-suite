# Nova Suite — Upgrade Strategy

## Zero-Downtime Upgrade Principles

1. **Database migrations run before code deploys** — new code always sees the latest schema
2. **Migrations must be backward-compatible** — old code must still work after migration
3. **Rolling deploys** — replace instances one at a time
4. **Health checks gate traffic** — unhealthy instances are removed from rotation

## Database Migration Strategy

### Forward-Only Migrations

Each migration is a numbered SQL file:

```
migrations/
├── 001_initial_schema.sql
├── 002_add_request_due_date.sql
├── 003_add_ci_tags.sql
└── ...
```

### Migration Ledger Contract

Nova Suite tracks applied schema versions in a migration ledger table:

```sql
CREATE TABLE schema_migrations (
  version     text PRIMARY KEY,
  name        text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
```

- Each schema change must insert exactly one new row into `schema_migrations`.
- The API and worker compare the latest DB `version` with `DB_SCHEMA_VERSION`.
- Mismatch behavior is degraded mode: API stays up with degraded health, and workflow background execution is gated.
- Version format is fixed-width semantic style: `vNN.NN.NN` (example baseline: `v00.01.00`).
- Database-level validation enforces the same version format with a table `CHECK` constraint.

### Version Bump Workflow

1. Add migration SQL (forward-only, backward-compatible when possible).
2. Insert a new ledger row (`schema_migrations.version = vNN.NN.NN`).
3. Set `DB_SCHEMA_VERSION=vNN.NN.NN` for `nova-engine` and `nova-worker`.
4. Deploy migration first, then deploy code.
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
-- Migration 004: Add due_date to requests
ALTER TABLE requests ADD COLUMN due_date timestamptz;

-- Backfill existing data
UPDATE requests r
SET due_date = r.created_at + (si.sla_hours || ' hours')::interval
FROM service_items si
WHERE si.id = r.service_item_id
  AND r.due_date IS NULL;
```

Deploy this migration, then deploy the code that uses `due_date`.

## Deployment Strategies

### Blue-Green Deployment

Run two identical environments (blue and green). Only one serves traffic at a time.

```
                     ┌──────────────┐
     Traffic ──────▶│  Load Balancer│
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
- [ ] Smoke tests pass against new version
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
