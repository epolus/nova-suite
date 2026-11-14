# Nova Suite — Upgrade Strategy

## Zero-Downtime Upgrade Principles

1. **Database migrations run before code deploys** — `nova-migrate` must finish before `nova-engine` / `nova-worker` start
2. **Migrations must be backward-compatible** — old code must still work after migration
3. **Rolling deploys** — replace instances one at a time
4. **Health checks gate traffic** — unhealthy instances are removed from rotation

## Database Migration Strategy

Empty Postgres volumes are created by [`infra/postgres/init.sql`](../infra/postgres/init.sql) and [`infra/postgres/rls.sql`](../infra/postgres/rls.sql) (`docker-entrypoint-initdb.d`). Fresh installs get the current schema and seed `schema_migrations` through the latest version (currently `v00.01.34`). Those files **do not re-run** on an existing volume.

Later schema changes for **existing** volumes are numbered SQL files under `infra/postgres/migrations/` (`vNN.NN.NN__slug.sql`). Each file is incremental DDL for databases that already have an older ledger. A wiped volume does not re-apply those files; it already matches `init.sql`.

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

## ServiceNow migrator (`v00.01.23`)

Apply `infra/postgres/migrations/v00.01.23__servicenow_migrator.sql` **before** rolling out engine/worker builds that:

- Write `migration_runs` (extract/transform Temporal activities)
- Create in-flow `request_tasks` with `parent_task_id` / `automation_checkpoint` (`action.task`, in-flow approvals)

Also keep `CATALOG_AUTOMATION_SHARED_KEY` identical on engine and worker — in-flow HTTP steps and catalog automation endpoints require it (see [`docs/ENVIRONMENT.md`](ENVIRONMENT.md)).

## Cost center responsible person (`v00.01.24`)

Apply `infra/postgres/migrations/v00.01.24__cost_center_responsible.sql` before rolling out builds that read or write `cost_centers.responsible_user_id`. The column is nullable; existing rows stay valid with a null responsible person.

## Users phone and lockout (`v00.01.28`)

Apply `infra/postgres/migrations/v00.01.28__users_phone_and_lockout.sql` before rolling out builds that read lockout, VIP, employee number, or user source. New columns have defaults, and `phone` stays nullable, so older app code keeps working. Lock enforcement starts when the new engine is deployed. Existing phones that are blank or exactly `+41` become null.

## Request task cancel (`v00.01.27`)

Apply `infra/postgres/migrations/v00.01.27__request_task_cancelled.sql` before using Skip or Cancel on a request task. The migration allows `cancelled` on `request_tasks.status`. Existing tasks are unchanged.

## Fulfillment models (`v00.01.26`)

Apply `infra/postgres/migrations/v00.01.26__fulfillment_models.sql` before using fulfillment models. The migration adds `fulfillment_models`, `service_items.fulfillment_model_id`, and the provisioned CI and asset columns on `requests`. Existing catalog items are unchanged.

## Department manager and external_id (`v00.01.25`)

Apply `infra/postgres/migrations/v00.01.25__department_manager.sql` before rolling out builds that read or write `departments.manager_id` or `departments.external_id`. Both columns are nullable; existing rows stay valid with null values. `external_id` is unique per tenant when set.

## Data management (`v00.01.29`)

Apply `infra/postgres/migrations/v00.01.29__data_management.sql` before opening Admin → Data management. The migration adds the `data_manager` role, lets that role read incidents, and creates `data_management_jobs`. Mount the uploads volume on `nova-worker` (`UPLOAD_DIR`) so a delete job can remove attachment files. Older app builds ignore the new table.

## Data management targets (`v00.01.30`)

Apply `infra/postgres/migrations/v00.01.30__data_management_targets.sql` before running retention jobs on requests, CMDB, assets, problems, changes, knowledge, alerts, releases, or improvements. The migration widens `data_management_jobs.target` and lets `data_manager` read those role-gated tables. CMDB, assets, knowledge, releases, and improvements were already visible to every tenant role.

## Incident classification (`v00.01.31`)

Apply `infra/postgres/migrations/v00.01.31__incident_classification.sql` before using Admin → Incident Classification or category/resolution-code selects on incidents. Adds `incident_categories`, `incident_resolution_codes`, and FK columns `category_id`, `closure_category_id`, and `resolution_code_id` on `incidents` (legacy text columns remain until backfill).

## Custom fields (`v00.01.32`)

Apply `infra/postgres/migrations/v00.01.32__custom_fields.sql` before using Admin → Custom Fields or entity custom-field values on incidents, changes, and assets. Adds EAV tables `field_definitions`, `field_options`, and `field_values` with immutable `field_key` and typed values.

## Record links (`v00.01.33`)

Apply `infra/postgres/migrations/v00.01.33__record_links.sql` before using Related records on entity detail pages. Adds `record_links` with undirected unique pairs and `link_type` in related/parent/duplicate.

## Inbound email (`v00.01.34`)

Apply `infra/postgres/migrations/v00.01.34__inbound_email.sql` before using IMAP mailboxes and inbound rules. Adds `mailboxes`, `email_messages`, and ordered `inbound_email_rules` (create/update/ignore with stop-on-match). Updates only apply while the incident is open.

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
