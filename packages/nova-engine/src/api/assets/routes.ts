/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { AppError, NotFound } from '../../middleware/errorHandler';
import { authenticate, getRequestClient, releaseTenantClient, setTenantRLS } from '../../middleware/auth';
import { hasChangeRole, hasProblemRole, isAdminRole } from '../roles';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

function canManageAssets(req: Request): boolean {
  return isAdminRole(req) || hasChangeRole(req) || hasProblemRole(req);
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT a.*, u.display_name AS owner_name, ci.display_name AS linked_ci_name
       FROM assets a
       LEFT JOIN users u ON u.id = a.owner_user_id
       LEFT JOIN configuration_items ci ON ci.id = a.linked_ci_id
       WHERE a.tenant_id = current_tenant_id()
       ORDER BY a.updated_at DESC`,
    );
    res.json({ assets: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageAssets(req)) throw new AppError(403, 'Insufficient permissions');
    const b = req.body || {};
    if (!b.asset_tag || !b.name) throw new AppError(400, 'asset_tag and name are required');
    const client = getRequestClient(req);
    const created = await client.query(
      `INSERT INTO assets (
         tenant_id, asset_tag, name, category, status, owner_user_id, linked_ci_id, vendor_name,
         purchase_cost, purchase_currency, purchase_date, warranty_expires_at, contract_ref, depreciation_months, notes
       ) VALUES (
         current_tenant_id(), $1, $2, COALESCE($3, 'hardware'), COALESCE($4, 'in_use'), $5, $6, $7,
         $8, COALESCE($9, 'USD'), $10, $11, $12, $13, $14
       ) RETURNING *`,
      [
        b.asset_tag,
        b.name,
        b.category || null,
        b.status || null,
        b.owner_user_id || null,
        b.linked_ci_id || null,
        b.vendor_name || null,
        b.purchase_cost ?? null,
        b.purchase_currency || null,
        b.purchase_date || null,
        b.warranty_expires_at || null,
        b.contract_ref || null,
        b.depreciation_months ?? null,
        b.notes || null,
      ],
    );
    res.status(201).json(created.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageAssets(req)) throw new AppError(403, 'Insufficient permissions');
    const updates = req.body || {};
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [key, value] of Object.entries(updates)) {
      sets.push(`${key} = $${i++}`);
      vals.push(value);
    }
    if (sets.length === 0) return void res.json({ success: true });
    vals.push(req.params.id);
    const client = getRequestClient(req);
    const updated = await client.query(
      `UPDATE assets
       SET ${sets.join(', ')}
       WHERE tenant_id = current_tenant_id()
         AND id = $${i}
       RETURNING *`,
      vals,
    );
    if (updated.rows.length === 0) throw NotFound('Asset not found');
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
