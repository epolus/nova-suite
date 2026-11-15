/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { AppError, NotFound } from '../../middleware/errorHandler';
import { authenticate, getRequestClient, releaseTenantClient, setTenantRLS } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import {
  ASSET_UPDATE_COLUMNS,
  assignAssetSchema,
  createAssetSchema,
  returnAssetSchema,
  updateAssetSchema,
} from '../../domain/schemas';
import { parameterizedSet } from '../../data/parameterized-set';
import { hasChangeRole, hasProblemRole, isAdminRole } from '../roles';
import { loadCustomFieldsMap, upsertCustomFields } from '../../domain/custom-fields';
import {
  assignAsset,
  listAssetAssignments,
  returnAsset,
} from '../../domain/asset-assignments';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

function canManageAssets(req: Request): boolean {
  return isAdminRole(req) || hasChangeRole(req) || hasProblemRole(req);
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const conditions = ['a.tenant_id = current_tenant_id()'];
    const params: unknown[] = [];
    if (typeof req.query.linked_ci_id === 'string' && req.query.linked_ci_id) {
      params.push(req.query.linked_ci_id);
      conditions.push(`a.linked_ci_id = $${params.length}`);
    }
    const rows = await client.query(
      `SELECT a.*, u.display_name AS owner_name, ci.display_name AS linked_ci_name
       FROM assets a
       LEFT JOIN users u ON u.id = a.owner_user_id
       LEFT JOIN configuration_items ci ON ci.id = a.linked_ci_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.updated_at DESC`,
      params,
    );
    res.json({ assets: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', validateBody(createAssetSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageAssets(req)) throw new AppError(403, 'Insufficient permissions');
    const b = req.body || {};
    if (!b.asset_tag || !b.name) throw new AppError(400, 'asset_tag and name are required');
    const client = getRequestClient(req);
    const created = await client.query(
      `INSERT INTO assets (
         tenant_id, asset_tag, name, category, status, owner_user_id, linked_ci_id, vendor_name,
         purchase_cost, purchase_currency, purchase_date, warranty_expires_at, contract_ref, depreciation_months, notes,
         external_id_1, external_id_2
       ) VALUES (
         current_tenant_id(), $1, $2, COALESCE($3, 'hardware'), COALESCE($4, 'in_use'), $5, $6, $7,
         $8, COALESCE($9, 'USD'), $10, $11, $12, $13, $14, $15, $16
       ) RETURNING *`,
      [
        b.asset_tag,
        b.name,
        b.category || null,
        b.status || null,
        null, // owner set via assignAsset below when provided
        b.linked_ci_id || null,
        b.vendor_name || null,
        b.purchase_cost ?? null,
        b.purchase_currency || null,
        b.purchase_date || null,
        b.warranty_expires_at || null,
        b.contract_ref || null,
        b.depreciation_months ?? null,
        b.notes || null,
        b.external_id_1 || null,
        b.external_id_2 || null,
      ],
    );
    if (b.owner_user_id) {
      await assignAsset(client, {
        assetId: String(created.rows[0].id),
        userId: String(b.owner_user_id),
        assignedBy: req.user!.id,
        notes: 'Initial assignment on create',
      });
    }
    await upsertCustomFields(client, 'asset', created.rows[0].id, b.custom_fields ?? {}, 'create');
    const custom_fields = await loadCustomFieldsMap(client, 'asset', created.rows[0].id);
    const refreshed = await client.query(
      `SELECT a.*, u.display_name AS owner_name
       FROM assets a
       LEFT JOIN users u ON u.id = a.owner_user_id
       WHERE a.id = $1`,
      [created.rows[0].id],
    );
    res.status(201).json({ ...refreshed.rows[0], custom_fields });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const row = await client.query(
      `SELECT a.*, u.display_name AS owner_name, ci.display_name AS linked_ci_name
       FROM assets a
       LEFT JOIN users u ON u.id = a.owner_user_id
       LEFT JOIN configuration_items ci ON ci.id = a.linked_ci_id
       WHERE a.tenant_id = current_tenant_id() AND a.id = $1`,
      [req.params.id],
    );
    if (row.rows.length === 0) throw NotFound('Asset not found');
    const custom_fields = await loadCustomFieldsMap(client, 'asset', String(req.params.id));
    res.json({ ...row.rows[0], custom_fields });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validateBody(updateAssetSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageAssets(req)) throw new AppError(403, 'Insufficient permissions');
    const body = req.body || {};
    const customFieldsPayload = body.custom_fields as Record<string, unknown> | undefined;
    // owner_user_id is managed by assign/return endpoints (and create).
    const { owner_user_id: _ignoredOwner, ...patchBody } = body;
    const patch = parameterizedSet(ASSET_UPDATE_COLUMNS, patchBody);
    const client = getRequestClient(req);
    let updated = null as Record<string, unknown> | null;
    if (patch) {
      const vals = [...patch.values, req.params.id];
      const result = await client.query(
        `UPDATE assets
         SET ${patch.sets.join(', ')}
         WHERE tenant_id = current_tenant_id()
           AND id = $${patch.sets.length + 1}
         RETURNING *`,
        vals,
      );
      if (result.rows.length === 0) throw NotFound('Asset not found');
      updated = result.rows[0];
    } else {
      const existing = await client.query(
        `SELECT * FROM assets WHERE tenant_id = current_tenant_id() AND id = $1`,
        [req.params.id],
      );
      if (existing.rows.length === 0) throw NotFound('Asset not found');
      updated = existing.rows[0];
    }
    if (customFieldsPayload !== undefined) {
      await upsertCustomFields(client, 'asset', String(req.params.id), customFieldsPayload, 'update');
    }
    const custom_fields = await loadCustomFieldsMap(client, 'asset', String(req.params.id));
    res.json({ ...updated, custom_fields });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/assignments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const assignments = await listAssetAssignments(client, String(req.params.id));
    res.json({ assignments });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/assign',
  validateBody(assignAssetSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!canManageAssets(req)) throw new AppError(403, 'Insufficient permissions');
      const client = getRequestClient(req);
      const assignment = await assignAsset(client, {
        assetId: String(req.params.id),
        userId: String(req.body.user_id),
        assignedBy: req.user!.id,
        notes: req.body.notes,
      });
      const asset = await client.query(
        `SELECT a.*, u.display_name AS owner_name
         FROM assets a
         LEFT JOIN users u ON u.id = a.owner_user_id
         WHERE a.id = $1`,
        [req.params.id],
      );
      res.status(201).json({ assignment, asset: asset.rows[0] });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/return',
  validateBody(returnAssetSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!canManageAssets(req)) throw new AppError(403, 'Insufficient permissions');
      const client = getRequestClient(req);
      const assignment = await returnAsset(client, {
        assetId: String(req.params.id),
        notes: req.body.notes,
      });
      const asset = await client.query(
        `SELECT a.*, u.display_name AS owner_name
         FROM assets a
         LEFT JOIN users u ON u.id = a.owner_user_id
         WHERE a.id = $1`,
        [req.params.id],
      );
      res.json({ assignment, asset: asset.rows[0] });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
