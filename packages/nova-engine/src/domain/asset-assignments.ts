/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { AppError } from '../middleware/errorHandler';

export type AssetAssignment = {
  id: string;
  asset_id: string;
  user_id: string;
  assigned_by: string;
  assigned_at: string;
  returned_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  user_name?: string;
  assigned_by_name?: string;
};

async function assertAssetExists(client: PoolClient, assetId: string): Promise<void> {
  const r = await client.query(
    `SELECT 1 FROM assets WHERE tenant_id = current_tenant_id() AND id = $1`,
    [assetId],
  );
  if (r.rowCount === 0) throw new AppError(404, 'Asset not found');
}

async function assertUserExists(client: PoolClient, userId: string): Promise<void> {
  const r = await client.query(
    `SELECT 1 FROM users WHERE tenant_id = current_tenant_id() AND id = $1 AND is_active = true`,
    [userId],
  );
  if (r.rowCount === 0) throw new AppError(400, 'Assignee user not found or inactive');
}

export async function listAssetAssignments(
  client: PoolClient,
  assetId: string,
): Promise<AssetAssignment[]> {
  await assertAssetExists(client, assetId);
  const r = await client.query(
    `SELECT a.*,
            u.display_name AS user_name,
            ab.display_name AS assigned_by_name
     FROM asset_assignments a
     JOIN users u ON u.id = a.user_id
     JOIN users ab ON ab.id = a.assigned_by
     WHERE a.tenant_id = current_tenant_id()
       AND a.asset_id = $1
     ORDER BY a.assigned_at DESC, a.created_at DESC`,
    [assetId],
  );
  return r.rows as AssetAssignment[];
}

async function closeOpenAssignments(
  client: PoolClient,
  assetId: string,
  notes?: string | null,
): Promise<void> {
  await client.query(
    `UPDATE asset_assignments
     SET returned_at = now(),
         notes = CASE
           WHEN $2::text IS NULL OR $2::text = '' THEN notes
           WHEN notes IS NULL OR notes = '' THEN $2
           ELSE notes || E'\n' || $2
         END
     WHERE tenant_id = current_tenant_id()
       AND asset_id = $1
       AND returned_at IS NULL`,
    [assetId, notes ?? null],
  );
}
export async function assignAsset(
  client: PoolClient,
  input: {
    assetId: string;
    userId: string;
    assignedBy: string;
    notes?: string | null;
  },
): Promise<AssetAssignment> {
  await assertAssetExists(client, input.assetId);
  await assertUserExists(client, input.userId);

  await closeOpenAssignments(client, input.assetId);

  await client.query(
    `UPDATE assets
     SET owner_user_id = $1
     WHERE tenant_id = current_tenant_id()
       AND id = $2`,
    [input.userId, input.assetId],
  );

  const inserted = await client.query(
    `INSERT INTO asset_assignments (
       tenant_id, asset_id, user_id, assigned_by, notes
     ) VALUES (
       current_tenant_id(), $1, $2, $3, $4
     )
     RETURNING *`,
    [input.assetId, input.userId, input.assignedBy, input.notes?.trim() || null],
  );

  const list = await listAssetAssignments(client, input.assetId);
  const created = list.find((row) => row.id === inserted.rows[0].id);
  if (!created) throw new AppError(500, 'Failed to load created assignment');
  return created;
}

export async function returnAsset(
  client: PoolClient,
  input: {
    assetId: string;
    notes?: string | null;
  },
): Promise<AssetAssignment> {
  await assertAssetExists(client, input.assetId);

  const open = await client.query(
    `SELECT id FROM asset_assignments
     WHERE tenant_id = current_tenant_id()
       AND asset_id = $1
       AND returned_at IS NULL
     LIMIT 1`,
    [input.assetId],
  );
  if (open.rowCount === 0) {
    throw new AppError(409, 'Asset has no open assignment to return', 'ASSET_NOT_ASSIGNED');
  }

  await closeOpenAssignments(client, input.assetId, input.notes);
  await client.query(
    `UPDATE assets
     SET owner_user_id = NULL
     WHERE tenant_id = current_tenant_id()
       AND id = $1`,
    [input.assetId],
  );

  const list = await listAssetAssignments(client, input.assetId);
  const closed = list.find((row) => row.id === open.rows[0].id);
  if (!closed) throw new AppError(500, 'Failed to load returned assignment');
  return closed;
}
