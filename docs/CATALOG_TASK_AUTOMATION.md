# How to: catalog task automation

Automated catalog tasks run inside the **Temporal catalog fulfillment** workflow on the **nova-worker**. They execute a compact state machine (`activity` / `decision` / `delay` / `end`) without waiting for a user signal, then complete or fail the `request_task` row from the activity.

## Prerequisites

- Worker process can reach your integration URLs (network, DNS, TLS).
- `catalog_tasks.automation_config` is stored as JSON (see `infra/postgres/init.sql` on fresh installs).
- Secrets are **not** stored in that JSON; use **worker environment variables** (`{{env.NAME}}`), or **encrypted vault** references (`{{cred.slug}}`) configured under Admin → **Credentials** (requires `CREDENTIALS_MASTER_KEY` on **nova-engine** and **nova-worker**).

## Configure in the UI

1. Admin → **Catalog tasks** → open or create a task.
2. Set **Task type** to **Automated**.
3. Edit **Automation (JSON)**, or use **Insert example** / **Insert at cursor** on the task detail page.

## JSON shape

`automation_config` must use:

- **`kind`** = `state_machine`
- **`startAt`** = starting state id
- **`states`** = array of states

Supported state types:

- **`activity`** — HTTP call step (`method`, `url`, `headers`, `body`, `timeoutSeconds`, retry/error fields).
- **`decision`** — boolean branch using a condition template.
- **`delay`** — wait a bounded number of seconds before next state.
- **`end`** — terminate with `result: success|failure`.

Common branch effects (supported on activity success/failure branches and end branches):

- **`skipTaskOrders`** — array of `task_order` values to skip.
- **`rejectRequest`** — reject current request (workflow-level rejection path).
- **`mergeFormData`** — flat map merged into `requests.form_data`.

## Templates

Interpolated before the request, and again for `mergeFormData` after a response:

| Pattern | Meaning |
|---------|---------|
| `{{request.number}}` | Request number |
| `{{request.id}}` | Request UUID |
| `{{request.form_data.FIELD}}` | Nested keys with dots, e.g. `request.form_data.asset_tag` |
| `{{request.delivery_info.FIELD}}` | Same for delivery JSON |
| `{{response.body}}` / dot paths | Parsed JSON body when response is JSON; numeric path segments index arrays |
| `{{response.text}}` | Raw response body string |
| `{{response.status}}` | HTTP status code |
| `{{env.VAR_NAME}}` | **Worker** `process.env` only |
| `{{cred.slug}}` | Secret stored in **tenant_credentials** (decrypted by the worker at runtime; slug must match an entry from Admin → Credentials). |

## REST authentication (no credentials in the script)

### Option A — Vault (recommended for rotation / UI-managed secrets)

1. Admin → **Credentials** → create a credential with slug `my_vendor_token` (same naming rules as URL-safe identifiers).
2. Set **`CREDENTIALS_MASTER_KEY`** (≥16 characters, shared by API and worker).
3. In automation JSON headers or body, use:

```json
"Authorization": "Bearer {{cred.my_vendor_token}}"
```

### Option B — Worker environment variables

1. Put the secret (token, API key, client secret) in the **worker** environment (Docker/Kubernetes secret → env).
2. In `headers`, reference it only by name, for example:

```json
{
  "kind": "state_machine",
  "startAt": "fetch",
  "states": [
    {
      "id": "fetch",
      "type": "activity",
      "method": "GET",
      "url": "https://api.example.com/v1/items/{{request.form_data.external_id}}",
      "headers": { "Authorization": "Bearer {{env.EXAMPLE_API_TOKEN}}" },
      "transitions": [{ "to": "done", "when": "success" }, { "to": "failed", "when": "failure" }]
    },
    { "id": "done", "type": "end", "result": "success" },
    { "id": "failed", "type": "end", "result": "failure" }
  ]
}
```

Do not paste raw tokens into the catalog JSON when you can use **`{{cred.slug}}`** or **`{{env.*}}`**. The JSON should reference **which** secret to use, not the secret itself.

## OAuth2 and other token flows (not built-in today)

The worker can run multiple HTTP `activity` states inside one automation graph. It still does **not** have built-in OAuth token flow/refresh orchestration inside catalog automation (use gateway/service pattern if needed).

**Recommended extension patterns** (product design, not current JSON fields):

1. **Sidecar or gateway** — Run a small HTTP service next to the worker that accepts your own signed internal requests, obtains OAuth tokens (client credentials, refresh grants), and proxies to the vendor. The catalog `url` points at that gateway; secrets stay in the gateway’s env or secret store.
2. **Dedicated activity / `kind`** — Add a worker implementation such as `oauth_client_credentials` that reads `client_id` / `client_secret` (or references) from env or a vault, POSTs to the token endpoint, caches the access token in memory or Redis with TTL, then calls the business API. Catalog JSON would only name **integration id** + resource paths, not raw secrets.
3. **Long-lived token in env** — For vendors that issue a static API token or a rarely rotated PAT, keep using **`{{env.*}}`** in headers until you need rotation automation.

**Idempotency warning:** the automation activity is configured for **Temporal retries** (see workflow: start-to-close **2 minutes**, **2 attempts**, backoff). If the first attempt reached the server and the second retries, **non-idempotent** POSTs can double side effects. Prefer GET for lookups, idempotent PUTs, or server-side deduplication keys in the body.

## Per-tenant secrets (today vs future)

**Today:** `{{env.VAR}}` is read from **`process.env` on the worker process**. That is effectively **one credential set per worker deployment** (all tenants share the same env unless you run multiple isolated workers).

**When you need different credentials per tenant:**

| Approach | Idea |
|----------|------|
| **Cell / shard workers** | Route each tenant’s Temporal workflows to a worker pool that has only that tenant’s env (hard isolation, ops-heavy). |
| **Secret resolver in code** | Store **`tenant_id` + integration key** in DB (not the secret); in a new activity, resolve the secret from Vault / AWS Secrets Manager / Azure Key Vault using the tenant id, then call the API. Catalog JSON holds only the **logical integration id**. |
| **Tenant-scoped env prefix** | Convention like `{{env.TENANT_ACME_API_TOKEN}}` and inject many vars at deploy time (does not scale past a small tenant list). |

Until a resolver exists, prefer a **gateway** per environment or static tokens where acceptable.

## Troubleshooting

| Symptom | Likely cause | What to check |
|---------|----------------|----------------|
| Task **`failed`**, notes mention **Invalid or missing automation_config** | `kind` not `state_machine`, missing `startAt`, or invalid `states[]` | Fix JSON; save catalog task again. |
| Task **`failed`**, notes start with **HTTP error:** | DNS, TLS, connection reset, **timeout** (`AbortError`), unreachable host | Worker logs/network; lower payload; increase **`timeoutSeconds`** (max **120**). |
| Task **`failed`**, notes show **Automation failed** with **httpStatus** 4xx/5xx | Partner returned non-2xx | URL, auth header, query params; use vendor docs for error body (truncated in **notes**). |
| **Success** in vendor UI but Nova marks **failure** | Only **HTTP 200–299** count as success | Redirects (3xx) without follow to 200, or “200 with error payload”, are still treated as success today—branch on body would need a future rule. |
| **`mergeFormData`** wrong or empty | **`{{response.body...}}`** paths assume **JSON** body; non-JSON leaves parsing limited | Confirm `Content-Type` and body shape; test with a small GET returning JSON. |
| Missing value in URL or headers | **`{{env.MISSING}}`** becomes an **empty string** (no error) | Typo in env name or secret not injected into worker container. |
| **`{{request.form_data.x}}`** empty | Field name mismatch or value not submitted on the request | Inspect `requests.form_data` in DB or request UI. |
| Wrong tasks **skipped** | **`skipTaskOrders`** skips **every** request task at those **task_order** values (pending or in_progress) | Use distinct orders for parallel paths; avoid overlapping orders you still need. |
| Automation ran **twice** (duplicate side effect) | **Temporal activity retry** after a timeout or worker crash mid-flight | Use idempotent APIs or dedupe keys; see OAuth section above. |
| Workflow **waiting** while automated task already **completed** | Same **order group** still has **manual** tasks waiting for completion | Expected: automated and manual in the same `task_order` run in parallel after activation. |
| Automated task waits for **human** | `task_type=automated` but `automation_config.kind` is not `state_machine` at request-task creation | Fix `automation_config` and submit a new request. |

**Timeouts (implementation detail):** per-request abort is **`timeoutSeconds`** clamped between **1** and **120** seconds. The Temporal activity budget is **2 minutes** start-to-close with **2** attempts.

## Operational notes

- Automated steps use a **longer activity timeout** than other catalog activities; very slow partners may still need smaller payloads or a proxy.
- Failed HTTP or invalid config sets the request task status to **`failed`** and writes details into **`notes`** (truncated at **8000** characters if huge).
- If `startAt` / `states` are invalid **at runtime**, the row is marked **`failed`** with an explanatory note.

## See also

- Worker implementation: `packages/nova-worker/src/activities/catalog-automation-activities.ts`
- Workflow wiring: `packages/nova-worker/src/workflows/catalog-fulfillment.ts`
- API persistence: `packages/nova-engine/src/api/catalog/routes.ts`
