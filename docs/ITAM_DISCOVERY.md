# ITAM discovery (Intune)

Nova includes a first-party Microsoft Intune discovery connector under
`packages/nova-engine/src/discovery/`.

## Sync

- **Admin API:** `POST /api/datasources/discovery/intune/sync`
  - Body (optional): `azure_tenant_id`, `client_id`, `client_secret`,
    `credential_slug`, `class_name` (default `laptop`), `create_assets`,
    `dry_run`
  - Env fallbacks: `INTUNE_TENANT_ID`, `INTUNE_CLIENT_ID`, `INTUNE_CLIENT_SECRET`
- **Data source:** create a source with `source_type: intune`, then
  `POST /api/datasources/:id/run` (engine-side connector; not Temporal fetch)

Missing credentials (or `dry_run: true`) returns mock devices without calling Graph.

## Fallback

Generic CSV / JSON / REST / SFTP data-source import (and `/api/import`) remains
the fallback for Jamf and other inventory systems without a first-party connector.
Map device ids to CMDB `external_id_1` / asset `external_id_1` and use upsert.
