/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import type {
  DiscoveredDevice,
  DiscoveryConnector,
  DiscoverySyncOptions,
  DiscoverySyncResult,
} from './types';

async function resolveCiClassId(client: PoolClient, className: string): Promise<string> {
  const byName = await client.query<{ id: string }>(
    `SELECT id FROM ci_classes
     WHERE tenant_id = current_tenant_id() AND lower(name) = lower($1)
     LIMIT 1`,
    [className],
  );
  if (byName.rows[0]?.id) return byName.rows[0].id;

  const fallback = await client.query<{ id: string }>(
    `SELECT id FROM ci_classes
     WHERE tenant_id = current_tenant_id() AND is_active = true
     ORDER BY name
     LIMIT 1`,
  );
  if (!fallback.rows[0]?.id) {
    throw new Error(`No CI class found (looked for "${className}")`);
  }
  return fallback.rows[0].id;
}

function ciStatusFromHint(hint: DiscoveredDevice['statusHint']): string {
  switch (hint) {
    case 'maintenance':
      return 'maintenance';
    case 'retired':
    case 'disposed':
      return 'retired';
    case 'in_stock':
    case 'ordered':
      return 'in_stock';
    default:
      return 'installed';
  }
}

function assetStatusFromHint(hint: DiscoveredDevice['statusHint']): string {
  return hint || 'in_use';
}

/** Empty feeds and failed upserts must not retire inventory. */
export function shouldRetireMissingDevices(
  fullSync: boolean,
  fetched: number,
  errorCount = 0,
): boolean {
  return fullSync && fetched > 0 && errorCount === 0;
}

async function upsertConfigurationItem(
  client: PoolClient,
  classId: string,
  device: DiscoveredDevice,
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM configuration_items
     WHERE tenant_id = current_tenant_id() AND external_id_1 = $1
     LIMIT 1`,
    [device.externalId],
  );

  const attributes = {
    source: 'intune',
    serial_number: device.serialNumber || undefined,
    manufacturer: device.manufacturer || undefined,
    model: device.model || undefined,
    os: device.operatingSystem || undefined,
    os_version: device.osVersion || undefined,
  };
  const status = ciStatusFromHint(device.statusHint);
  const displayName = device.displayName || device.name;
  const notes = device.serialNumber ? `Serial: ${device.serialNumber}` : null;

  if (existing.rows[0]?.id) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE configuration_items SET
         name = $2,
         display_name = $3,
         status = $4::ci_status_enum,
         attributes = COALESCE(attributes, '{}'::jsonb) || $5::jsonb,
         external_id_2 = COALESCE($6, external_id_2),
         notes = COALESCE($7, notes),
         is_active = true,
         updated_at = now()
       WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [
        id,
        device.name,
        displayName,
        status,
        JSON.stringify(attributes),
        device.externalIdSecondary || null,
        notes,
      ],
    );
    return id;
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO configuration_items (
       tenant_id, class_id, name, display_name, status, environment,
       attributes, notes, external_id_1, external_id_2, is_active
     ) VALUES (
       current_tenant_id(), $1, $2, $3, $4::ci_status_enum, 'production',
       $5::jsonb, $6, $7, $8, true
     ) RETURNING id`,
    [
      classId,
      device.name,
      displayName,
      status,
      JSON.stringify(attributes),
      notes,
      device.externalId,
      device.externalIdSecondary || null,
    ],
  );
  return inserted.rows[0].id;
}

async function upsertAsset(
  client: PoolClient,
  device: DiscoveredDevice,
  linkedCiId: string,
): Promise<void> {
  const assetTag = (device.assetTag || `INTUNE-${device.externalId}`).slice(0, 255);
  const status = assetStatusFromHint(device.statusHint);
  const vendor = device.manufacturer || null;
  const notesParts = [
    device.model ? `Model: ${device.model}` : null,
    device.operatingSystem ? `OS: ${device.operatingSystem} ${device.osVersion || ''}`.trim() : null,
    'Source: Intune discovery',
  ].filter(Boolean);
  const notes = notesParts.join(' | ');

  const byExternal = await client.query<{ id: string }>(
    `SELECT id FROM assets
     WHERE tenant_id = current_tenant_id() AND external_id_1 = $1
     LIMIT 1`,
    [device.externalId],
  );

  if (byExternal.rows[0]?.id) {
    await client.query(
      `UPDATE assets SET
         name = $2,
         status = $3,
         linked_ci_id = $4,
         vendor_name = COALESCE($5, vendor_name),
         external_id_2 = COALESCE($6, external_id_2),
         notes = $7,
         updated_at = now()
       WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [
        byExternal.rows[0].id,
        device.displayName || device.name,
        status,
        linkedCiId,
        vendor,
        device.externalIdSecondary || null,
        notes,
      ],
    );
    return;
  }

  const byTag = await client.query<{ id: string }>(
    `SELECT id FROM assets
     WHERE tenant_id = current_tenant_id() AND asset_tag = $1
     LIMIT 1`,
    [assetTag],
  );

  if (byTag.rows[0]?.id) {
    await client.query(
      `UPDATE assets SET
         name = $2,
         status = $3,
         linked_ci_id = $4,
         vendor_name = COALESCE($5, vendor_name),
         external_id_1 = $6,
         external_id_2 = COALESCE($7, external_id_2),
         notes = $8,
         updated_at = now()
       WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [
        byTag.rows[0].id,
        device.displayName || device.name,
        status,
        linkedCiId,
        vendor,
        device.externalId,
        device.externalIdSecondary || null,
        notes,
      ],
    );
    return;
  }

  await client.query(
    `INSERT INTO assets (
       tenant_id, asset_tag, name, category, status, linked_ci_id, vendor_name,
       notes, external_id_1, external_id_2
     ) VALUES (
       current_tenant_id(), $1, $2, 'hardware', $3, $4, $5, $6, $7, $8
     )`,
    [
      assetTag,
      device.displayName || device.name,
      status,
      linkedCiId,
      vendor,
      notes,
      device.externalId,
      device.externalIdSecondary || null,
    ],
  );
}

export async function syncDiscoveredDevices(
  client: PoolClient,
  connector: DiscoveryConnector,
  options: DiscoverySyncOptions = {},
): Promise<DiscoverySyncResult> {
  const dryRun = options.dryRun === true;
  const createAssets = options.createAssets !== false;
  const className = options.className || 'laptop';
  const errors: string[] = [];
  let cisUpserted = 0;
  let assetsUpserted = 0;
  let cisRetired = 0;
  let assetsRetired = 0;

  const devices = await connector.fetchDevices({ dryRun });

  if (dryRun) {
    return {
      connector: connector.name,
      dryRun: true,
      fetched: devices.length,
      cisUpserted: 0,
      assetsUpserted: 0,
      cisRetired: 0,
      assetsRetired: 0,
      errors: [],
      sample: devices.slice(0, 5),
    };
  }

  const classId = await resolveCiClassId(client, className);

  for (const device of devices) {
    try {
      const ciId = await upsertConfigurationItem(client, classId, device);
      cisUpserted += 1;
      if (createAssets) {
        await upsertAsset(client, device, ciId);
        assetsUpserted += 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${device.externalId}: ${msg}`);
    }
  }

  const seenIds = devices.map((device) => device.externalId.trim()).filter((id) => id.length > 0);
  if (shouldRetireMissingDevices(options.fullSync === true, seenIds.length, errors.length)) {
    const retiredCis = await client.query(
      `UPDATE configuration_items
       SET status = 'retired'::ci_status_enum,
           is_active = false,
           updated_at = now()
       WHERE tenant_id = current_tenant_id()
         AND external_id_1 IS NOT NULL
         AND attributes->>'source' = $1
         AND NOT (external_id_1 = ANY($2::text[]))
         AND (status <> 'retired' OR is_active = true)`,
      [connector.name, seenIds],
    );
    cisRetired = retiredCis.rowCount ?? 0;
    const retiredAssets = await client.query(
      `UPDATE assets
       SET status = 'retired',
           updated_at = now()
       WHERE tenant_id = current_tenant_id()
         AND external_id_1 IS NOT NULL
         AND status <> 'retired'
         AND NOT (external_id_1 = ANY($2::text[]))
         AND EXISTS (
           SELECT 1 FROM configuration_items ci
           WHERE ci.tenant_id = assets.tenant_id
             AND ci.external_id_1 = assets.external_id_1
             AND ci.attributes->>'source' = $1
         )`,
      [connector.name, seenIds],
    );
    assetsRetired = retiredAssets.rowCount ?? 0;
  }

  return {
    connector: connector.name,
    dryRun: false,
    fetched: devices.length,
    cisUpserted,
    assetsUpserted,
    cisRetired,
    assetsRetired,
    errors,
  };
}
