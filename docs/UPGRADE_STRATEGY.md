# Nova Suite — Upgrade Strategy

## Zero-Downtime Upgrade Principles

1. **Database migrations run before code deploys** — `nova-migrate` must finish before `nova-engine` / `nova-worker` start
2. **Migrations must be backward-compatible** — old code must still work after migration
3. **Rolling deploys** — replace instances one at a time
4. **Health checks gate traffic** — unhealthy instances are removed from rotation

## Database Migration Strategy

Empty Postgres volumes are created by [`infra/postgres/init.sql`](../infra/postgres/init.sql) and [`infra/postgres/rls.sql`](../infra/postgres/rls.sql) (`docker-entrypoint-initdb.d`). Fresh installs get the current schema and seed `schema_migrations` through the latest version (currently `v00.01.48`). Those files **do not re-run** on an existing volume.

Later schema changes for **existing** volumes are numbered SQL files under `infra/postgres/migrations/` (`vNN.NN.NN__slug.sql`). Each file is incremental DDL for databases that already have an older ledger. A wiped volume does not re-apply those files; it already matches `init.sql`.

`nova-migrate` (compose one-shot, same image as the engine, command `node packages/nova-engine/dist/migrate.js`) connects as `POSTGRES_USER` (`nova_app`), applies any file whose version is greater than the ledger, then exits. Engine and worker wait on `service_completed_successfully` and keep using `POSTGRES_APP_USER` (`nova_runtime`).

### Migration Ledger Contract

```sql
CREATE TABLE schema_migrations (
  version     text PRIMARY KEY,
  name        text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  checksum    text
);
```

- Filename pattern: `vNN.NN.NN__slug.sql` (example: `v00.01.01__add_request_due_date.sql`).
- One file per version. Duplicate versions fail the job.
- Each successful file inserts exactly one ledger row, with the sha256 of the file (line endings normalized). SQL error rolls back that file and exits non-zero.
- API and worker compare `MAX(version)` with `DB_SCHEMA_VERSION`. Mismatch → degraded health; worker will not poll workflows.
- If `schema_migrations` is missing, the job fails. It does not repair an unknown database.

### Forward-Only Repair Policy

Applied migrations are immutable. There are no down migrations.

- On every run, `nova-migrate` compares each applied version's recorded checksum with the file on disk. A changed file stops the job before anything is applied, naming the versions.
- Fix a bad migration with a **new** migration that corrects the schema, then restore the edited file to what was applied.
- Rows without a checksum (installs older than `v00.01.46`, and fresh installs seeded by `init.sql`) get one recorded from the current file on the first run.
- For a harmless edit (comment, whitespace), confirm the diff and run once with `NOVA_MIGRATE_ACCEPT_CHECKSUMS=v00.01.40,v00.01.41` to re-record those checksums. Remove the variable afterwards.
- To roll back a release, restore from the pre-migration backup; do not hand-edit the ledger.

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

## Email templates & signatures (`v00.01.35`)

Apply `infra/postgres/migrations/v00.01.35__email_templates_signatures.sql` before using agent reply templates. Adds tenant `email_templates` (name, subject, body, locale) and per-user `user_email_signatures`. Templates are inserted by agents into journal/compose; they are not notification rules.

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

## Work logs (`v00.01.36`)

Apply `infra/postgres/migrations/v00.01.36__work_logs.sql` before using time entries. Adds `work_logs` for entity types incident, request_task, problem_task, and change (minutes, worked_on, note, is_customer_visible).

## On-call rota (`v00.01.43`)

Apply `infra/postgres/migrations/v00.01.43__on_call_rota.sql` before using the on-call calendar. Seeds `on_call_admin` and `on_call` roles, adds `rota_shifts` (assignment group, user, `starts_at` / `ends_at`), RLS, and grants. Alert-created incidents set `assigned_to` from the covering shift when one exists. UI: `/on-call`.

## Integrity constraints (`v00.01.44`)

Apply `infra/postgres/migrations/v00.01.44__integrity_constraints.sql`. Adds `field_values` shape trigger (entity type must match definition; exactly one typed value column), incident category/resolution FKs `ON DELETE RESTRICT`, per-mailbox `email_messages` uniqueness plus `in_reply_to` index, `sla_notifications_sent.entity_type` check aligned with SLA process types, checklist done-state check and template `ON DELETE RESTRICT`, and `asset_assignments.returned_at >= assigned_at`.

## Tenant-scoped auth and KB numbers (`v00.01.45`)

Apply `infra/postgres/migrations/v00.01.45__tenant_scoped_auth_and_kb_numbers.sql` before rolling out the engine. Adds `lookup_user_for_login(email, tenant_id)` (case-insensitive) and `lookup_user_for_sso(subject, tenant_id)`; the one-argument versions stay for older engines during a rolling deploy. Adds `kb_number_seq` (starts above the highest existing `KBnnnn`) and replaces the global `knowledge_articles.number` unique key with `(tenant_id, number)`.

Behavior changes in the matching engine release:

- SSO no longer auto-provisions or links unknown users unless `OIDC_ALLOWED_EMAIL_DOMAINS` is set. Set it **before** upgrading if you rely on just-in-time provisioning.
- `NOVA_INBOUND_WEBHOOK_SECRET` is only accepted for `NOVA_PRIMARY_TENANT_ID`.
- Attachments are authorized against their parent record; attachments on unknown entity types are readable by admins only.
- Bulk-imported users without a password get a random one; they sign in via SSO or an admin password reset.

## Resumable imports and migration checksums (`v00.01.46`)

Apply `infra/postgres/migrations/v00.01.46__resumable_imports_and_migration_checksums.sql` before rolling out the engine and worker.

- `data_source_runs` gains `execution_key`, `attempt` and `next_row` with a unique `(data_source_id, execution_key)`. The worker now imports in transactions of 50 rows; a retried activity resumes the same run at its last committed chunk instead of inserting every row again. Resuming assumes the source returns rows in the same order; upsert mode is unaffected by order.
- `resolve_user_access(user_id, tenant_id)` returns `is_active` and all roles (direct and assignment-group). The engine calls it once per authenticated request, for password login and for SSO login. **Deactivated users are rejected immediately**, without waiting for their token to expire; lockout from failed logins still only blocks new logins.
- `schema_migrations.checksum` (see the forward-only repair policy above).

Engine environment values are validated at startup: a malformed value (for example `REDIS_ENABLED=True` or `API_PORT=40OO`) now stops the engine with a list of every invalid variable, instead of silently using the default.

## Server-side sessions (`v00.01.47`)

Apply `infra/postgres/migrations/v00.01.47__user_sessions.sql` before rolling out the engine and web image.

- Every login (password or SSO) creates a `user_sessions` row, and the access token carries its id (`sid`). `resolve_session_access(session_id, user_id, tenant_id)` checks the session on every request, so **logout, deactivation, an admin lock and an admin password reset end that user's sessions immediately**.
- **Everyone has to sign in once after the upgrade**: tokens issued before `v00.01.47` have no session id and are rejected.
- The web app no longer keeps the token in `localStorage`. The API sets the httpOnly cookie `nova_session` (`Path=/api`, `SameSite=Lax`, `Secure` on HTTPS) to the **session id**, not the access token. API scripts are unchanged: `POST /api/auth/login` still returns `token` for `Authorization: Bearer`, and `POST /api/auth/logout` revokes whichever credential was presented.
- Cookie-authenticated writes (`POST/PUT/PATCH/DELETE`) must come from the API's own host or an origin in `TRUSTED_ORIGINS`; anything else gets `403`. Behind a TLS-terminating proxy keep `TRUST_PROXY` correct so the cookie is marked `Secure`, or force it with `SESSION_COOKIE_SECURE=true`.
- The web container now sends a strict Content-Security-Policy (external scripts only, plus a per-request `script-src` nonce) plus `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `Permissions-Policy`. If you serve the built SPA from your own web server, copy the headers from `packages/nova-web/Caddyfile`. Behind Cloudflare with **JavaScript Detections** / Bot Fight Mode, keep that nonce in the **response header** (not a `<meta>` CSP) so Cloudflare can stamp it on the inline bootstrap it injects; otherwise DevTools reports `script-src-elem` blocked at `(index):…`. As a temporary workaround you can turn off JavaScript Detections under Security → Bots.

## Session cookie lookup (`v00.01.48`)

Apply `infra/postgres/migrations/v00.01.48__session_cookie_lookup.sql` with the engine that reads browser sessions. `lookup_session_user(session_id)` loads the user for the `nova_session` cookie. A cookie left over from a build that stored the access token in `nova_session` no longer authenticates; those browsers sign in again. Bearer tokens are unchanged.

## Temporal Workflow Versioning

Workflow code is replayed from history, so any change to the commands a workflow issues (activities, timers, child workflows, or their order) breaks executions that are already running. Activity bodies and activity options (timeouts, retry policy) may change freely.

- Gate workflow changes with `patched(WORKFLOW_PATCHES.x)` from `packages/nova-worker/src/workflows/patches.ts`. Each ID is used once and never reused.
- Once no execution started before the change is still open (check Admin → Workflows, or the longest workflow lifetime: SLA escalation lives as long as the incident), replace `patched(id)` with `deprecatePatch(id)` and keep only the new branch. Remove the call one release later.
- The worker drains for `WORKER_SHUTDOWN_GRACE_MS` on SIGTERM; compose gives it `stop_grace_period: 40s`.
