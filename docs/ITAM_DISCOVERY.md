# ITAM discovery (Intune)

Nova includes a first-party Microsoft Intune discovery connector under
`packages/nova-engine/src/discovery/`.

## Sync

- **Admin API:** `POST /api/datasources/discovery/intune/sync`
  - Body (optional): `azure_tenant_id`, `client_id`, `client_secret`,
    `credential_slug`, `class_name` (default `laptop`), `create_assets`,
    `full_sync`, `dry_run`
  - Env fallbacks: `INTUNE_TENANT_ID`, `INTUNE_CLIENT_ID`, `INTUNE_CLIENT_SECRET`
- **Data source:** create a source with `source_type: intune`, then
  `POST /api/datasources/:id/run` (engine-side connector; not Temporal fetch).
  Set `import_mode` to `full_sync` when missing devices should be retired.

Missing credentials (or `dry_run: true`) returns mock devices without calling Graph.

## Full sync (retire missing)

When `full_sync` is true on the API call, or the data source uses
`import_mode: full_sync`, Nova retires Intune-sourced configuration items and
assets whose `external_id_1` is missing from the feed.

- An **empty** feed never retires.
- A feed that returned upsert errors does not retire.
- Status becomes `retired` (and the CI is marked inactive).

Without full sync, missing devices stay as they are; only devices present in
the feed are upserted.

## Fallback

Generic CSV / JSON / REST / SFTP data-source import (and `/api/import`) remains
the fallback for Jamf and other inventory systems without a first-party connector.
Map device ids to CMDB `external_id_1` / asset `external_id_1` and use upsert.
Jamf can use `import_mode: full_sync` on a generic source once the feed and
upsert key are wired the same way as Intune.
