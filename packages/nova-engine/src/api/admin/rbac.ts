/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Admin: Roles ───

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../data/db';
import { AppError } from '../../middleware/errorHandler';

const router = Router();

// ════════════════════════════════════════════
// ROLES
// ════════════════════════════════════════════

router.get('/roles', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany(
      `SELECT id, name, description, is_active, created_at, updated_at
       FROM roles WHERE tenant_id = $1 ORDER BY name`,
      [tenantId],
    );
    res.json({ roles: rows });
  } catch (err) { next(err); }
});

router.post('/roles', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { name, description } = req.body;
    if (!name) throw new AppError(400, 'name is required');
    const row = await db.getOne<{ id: string }>(
      'INSERT INTO roles (tenant_id, name, description) VALUES ($1, $2, $3) RETURNING id',
      [tenantId, name, description || null],
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch('/roles/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { name, description, is_active } = req.body;
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
    if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description || null); }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }
    if (sets.length === 0) { res.json({ success: true }); return; }
    vals.push(req.params.id, tenantId);
    await db.query(`UPDATE roles SET ${sets.join(', ')} WHERE id = $${i++} AND tenant_id = $${i}`, vals);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
