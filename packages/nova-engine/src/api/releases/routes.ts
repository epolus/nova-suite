/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { AppError, NotFound } from '../../middleware/errorHandler';
import { authenticate, getRequestClient, releaseTenantClient, setTenantRLS } from '../../middleware/auth';
import { hasChangeRole, isAdminRole } from '../roles';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

function canManageRelease(req: Request): boolean {
  return isAdminRole(req) || hasChangeRole(req);
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT r.*, u.display_name AS owner_name, c.number AS change_number, c.title AS change_title
       FROM releases r
       LEFT JOIN users u ON u.id = r.owner_user_id
       LEFT JOIN changes c ON c.id = r.change_id
       WHERE r.tenant_id = current_tenant_id()
       ORDER BY r.planned_start DESC NULLS LAST, r.updated_at DESC`,
    );
    res.json({ releases: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageRelease(req)) throw new AppError(403, 'Insufficient permissions');
    const b = req.body || {};
    if (!b.title) throw new AppError(400, 'title is required');
    const client = getRequestClient(req);
    const seq = await client.query(`SELECT nextval('change_number_seq') AS n`);
    const number = b.number || `REL${String(seq.rows[0].n).padStart(7, '0')}`;
    const created = await client.query(
      `INSERT INTO releases (
         tenant_id, number, title, description, status, release_type, risk_level,
         planned_start, planned_end, deployed_at, owner_user_id, change_id, validation_notes, rollback_plan
       ) VALUES (
         current_tenant_id(), $1, $2, $3, COALESCE($4, 'planned'), COALESCE($5, 'minor'), COALESCE($6, 'medium'),
         $7, $8, $9, $10, $11, $12, $13
       ) RETURNING *`,
      [
        number,
        b.title,
        b.description || null,
        b.status || null,
        b.release_type || null,
        b.risk_level || null,
        b.planned_start || null,
        b.planned_end || null,
        b.deployed_at || null,
        b.owner_user_id || req.user!.id,
        b.change_id || null,
        b.validation_notes || null,
        b.rollback_plan || null,
      ],
    );
    res.status(201).json(created.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageRelease(req)) throw new AppError(403, 'Insufficient permissions');
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
      `UPDATE releases
       SET ${sets.join(', ')}
       WHERE tenant_id = current_tenant_id()
         AND id = $${i}
       RETURNING *`,
      vals,
    );
    if (updated.rows.length === 0) throw NotFound('Release not found');
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
