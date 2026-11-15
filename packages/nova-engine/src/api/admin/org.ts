/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Admin: Departments, cost centers, companies, locations ───

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../data/db';
import { AppError } from '../../middleware/errorHandler';

const router = Router();

// ════════════════════════════════════════════
// DEPARTMENTS
// ════════════════════════════════════════════

router.get('/departments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany(
      `SELECT d.id, d.name, d.description, d.parent_department_id, d.cost_center_id, d.manager_id, d.external_id, d.is_active, d.created_at, d.updated_at,
              pd.name AS parent_department_name,
              cc.name AS cost_center_name,
              cc.code AS cost_center_code,
              mu.display_name AS manager_name,
              (SELECT count(*) FROM users u WHERE u.department_id = d.id AND u.is_active)::int AS user_count
       FROM departments d
       LEFT JOIN departments pd ON pd.id = d.parent_department_id
       LEFT JOIN cost_centers cc ON cc.id = d.cost_center_id
       LEFT JOIN users mu ON mu.id = d.manager_id
       WHERE d.tenant_id = $1
       ORDER BY d.name`,
      [tenantId],
    );
    res.json({ departments: rows });
  } catch (err) { next(err); }
});

router.post('/departments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { name, description, parent_department_id, cost_center_id, manager_id, external_id } = req.body;
    if (!name) throw new AppError(400, 'name is required');
    const parentDepartmentId = parent_department_id || null;
    const costCenterId = cost_center_id || null;
    const managerId = manager_id || null;
    const externalId = external_id || null;
    if (parentDepartmentId) {
      const parent = await db.getOne<{ id: string }>(
        'SELECT id FROM departments WHERE id = $1 AND tenant_id = $2',
        [parentDepartmentId, tenantId],
      );
      if (!parent) throw new AppError(400, 'parent_department_id must reference an existing department in this tenant');
    }
    if (costCenterId) {
      const costCenter = await db.getOne<{ id: string }>(
        'SELECT id FROM cost_centers WHERE id = $1 AND tenant_id = $2',
        [costCenterId, tenantId],
      );
      if (!costCenter) throw new AppError(400, 'cost_center_id must reference an existing cost center in this tenant');
    }
    if (managerId) {
      const manager = await db.getOne<{ id: string }>(
        'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
        [managerId, tenantId],
      );
      if (!manager) throw new AppError(400, 'manager_id must reference an existing user in this tenant');
    }
    const row = await db.getOne<{ id: string }>(
      'INSERT INTO departments (tenant_id, name, description, parent_department_id, cost_center_id, manager_id, external_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [tenantId, name, description || null, parentDepartmentId, costCenterId, managerId, externalId],
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch('/departments/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { name, description, is_active, parent_department_id, cost_center_id, manager_id, external_id } = req.body;
    if (parent_department_id !== undefined) {
      const parentDepartmentId = parent_department_id || null;
      if (parentDepartmentId === req.params.id) {
        throw new AppError(400, 'department cannot be its own parent');
      }
      if (parentDepartmentId) {
        const parent = await db.getOne<{ id: string }>(
          'SELECT id FROM departments WHERE id = $1 AND tenant_id = $2',
          [parentDepartmentId, tenantId],
        );
        if (!parent) throw new AppError(400, 'parent_department_id must reference an existing department in this tenant');
      }
    }
    if (cost_center_id !== undefined) {
      const costCenterId = cost_center_id || null;
      if (costCenterId) {
        const costCenter = await db.getOne<{ id: string }>(
          'SELECT id FROM cost_centers WHERE id = $1 AND tenant_id = $2',
          [costCenterId, tenantId],
        );
        if (!costCenter) throw new AppError(400, 'cost_center_id must reference an existing cost center in this tenant');
      }
    }
    if (manager_id !== undefined) {
      const managerId = manager_id || null;
      if (managerId) {
        const manager = await db.getOne<{ id: string }>(
          'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
          [managerId, tenantId],
        );
        if (!manager) throw new AppError(400, 'manager_id must reference an existing user in this tenant');
      }
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
    if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description || null); }
    if (parent_department_id !== undefined) { sets.push(`parent_department_id = $${i++}`); vals.push(parent_department_id || null); }
    if (cost_center_id !== undefined) { sets.push(`cost_center_id = $${i++}`); vals.push(cost_center_id || null); }
    if (manager_id !== undefined) { sets.push(`manager_id = $${i++}`); vals.push(manager_id || null); }
    if (external_id !== undefined) { sets.push(`external_id = $${i++}`); vals.push(external_id || null); }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }
    if (sets.length === 0) { res.json({ success: true }); return; }
    vals.push(req.params.id, tenantId);
    await db.query(`UPDATE departments SET ${sets.join(', ')} WHERE id = $${i++} AND tenant_id = $${i}`, vals);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// COST CENTERS
// ════════════════════════════════════════════

router.get('/cost-centers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany(
      `SELECT cc.id, cc.code, cc.name, cc.description, cc.is_active, cc.created_at, cc.updated_at,
              cc.responsible_user_id,
              ru.display_name AS responsible_user_name,
              (SELECT count(*) FROM users u WHERE u.cost_center_id = cc.id AND u.is_active)::int AS user_count,
              (SELECT count(*) FROM departments d WHERE d.cost_center_id = cc.id AND d.is_active)::int AS department_count
       FROM cost_centers cc
       LEFT JOIN users ru ON ru.id = cc.responsible_user_id
       WHERE cc.tenant_id = $1
       ORDER BY cc.code`,
      [tenantId],
    );
    res.json({ cost_centers: rows });
  } catch (err) { next(err); }
});

router.post('/cost-centers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { code, name, description, responsible_user_id } = req.body;
    if (!code || !name) throw new AppError(400, 'code and name are required');
    const responsibleUserId = responsible_user_id || null;
    if (responsibleUserId) {
      const user = await db.getOne<{ id: string }>(
        'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
        [responsibleUserId, tenantId],
      );
      if (!user) throw new AppError(400, 'responsible_user_id must reference an existing user in this tenant');
    }
    const row = await db.getOne<{ id: string }>(
      'INSERT INTO cost_centers (tenant_id, code, name, description, responsible_user_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [tenantId, code, name, description || null, responsibleUserId],
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch('/cost-centers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { code, name, description, is_active, responsible_user_id } = req.body;
    if (responsible_user_id !== undefined) {
      const responsibleUserId = responsible_user_id || null;
      if (responsibleUserId) {
        const user = await db.getOne<{ id: string }>(
          'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
          [responsibleUserId, tenantId],
        );
        if (!user) throw new AppError(400, 'responsible_user_id must reference an existing user in this tenant');
      }
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (code !== undefined) { sets.push(`code = $${i++}`); vals.push(code); }
    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
    if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description || null); }
    if (responsible_user_id !== undefined) { sets.push(`responsible_user_id = $${i++}`); vals.push(responsible_user_id || null); }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }
    if (sets.length === 0) { res.json({ success: true }); return; }
    vals.push(req.params.id, tenantId);
    await db.query(`UPDATE cost_centers SET ${sets.join(', ')} WHERE id = $${i++} AND tenant_id = $${i}`, vals);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// COMPANIES
// ════════════════════════════════════════════

router.get('/companies', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany(
      `SELECT c.id, c.name, c.code, c.website, c.phone, c.street, c.city, c.state, c.zip, c.country,
              c.parent_company_id, c.contact_user_id, c.description, c.is_active, c.created_at, c.updated_at,
              pc.name AS parent_company_name,
              u.display_name AS contact_user_name,
              (SELECT count(*) FROM locations l WHERE l.company_id = c.id AND l.is_active)::int AS location_count
       FROM companies c
       LEFT JOIN companies pc ON pc.id = c.parent_company_id
       LEFT JOIN users u ON u.id = c.contact_user_id
       WHERE c.tenant_id = $1
       ORDER BY c.name`,
      [tenantId],
    );
    res.json({ companies: rows });
  } catch (err) { next(err); }
});

router.post('/companies', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const {
      name, code, website, phone, street, city, state, zip, country,
      parent_company_id, contact_user_id, description,
    } = req.body;
    if (!name) throw new AppError(400, 'name is required');
    const row = await db.getOne<{ id: string }>(
      `INSERT INTO companies (
        tenant_id, name, code, website, phone, street, city, state, zip, country,
        parent_company_id, contact_user_id, description
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      ) RETURNING id`,
      [
        tenantId, name, code || null, website || null, phone || null, street || null,
        city || null, state || null, zip || null, country || null,
        parent_company_id || null, contact_user_id || null, description || null,
      ],
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch('/companies/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const {
      name, code, website, phone, street, city, state, zip, country,
      parent_company_id, contact_user_id, description, is_active,
    } = req.body;
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
    if (code !== undefined) { sets.push(`code = $${i++}`); vals.push(code || null); }
    if (website !== undefined) { sets.push(`website = $${i++}`); vals.push(website || null); }
    if (phone !== undefined) { sets.push(`phone = $${i++}`); vals.push(phone || null); }
    if (street !== undefined) { sets.push(`street = $${i++}`); vals.push(street || null); }
    if (city !== undefined) { sets.push(`city = $${i++}`); vals.push(city || null); }
    if (state !== undefined) { sets.push(`state = $${i++}`); vals.push(state || null); }
    if (zip !== undefined) { sets.push(`zip = $${i++}`); vals.push(zip || null); }
    if (country !== undefined) { sets.push(`country = $${i++}`); vals.push(country || null); }
    if (parent_company_id !== undefined) { sets.push(`parent_company_id = $${i++}`); vals.push(parent_company_id || null); }
    if (contact_user_id !== undefined) { sets.push(`contact_user_id = $${i++}`); vals.push(contact_user_id || null); }
    if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description || null); }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }
    if (sets.length === 0) { res.json({ success: true }); return; }
    vals.push(req.params.id, tenantId);
    await db.query(`UPDATE companies SET ${sets.join(', ')} WHERE id = $${i++} AND tenant_id = $${i}`, vals);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// LOCATIONS
// ════════════════════════════════════════════

router.get('/locations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany(
      `SELECT l.id, l.name, l.code, l.source, l.country, l.state, l.city, l.zip, l.street,
              l.parent_location_id, l.company_id, l.description, l.is_active, l.created_at, l.updated_at,
              pl.name AS parent_location_name,
              c.name AS company_name
       FROM locations l
       LEFT JOIN locations pl ON pl.id = l.parent_location_id
       LEFT JOIN companies c ON c.id = l.company_id
       WHERE l.tenant_id = $1
       ORDER BY l.name`,
      [tenantId],
    );
    res.json({ locations: rows });
  } catch (err) { next(err); }
});

router.post('/locations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const {
      name, code, source, country, state, city, zip, street,
      parent_location_id, company_id, description,
    } = req.body;
    if (!name || !code) throw new AppError(400, 'name and code are required');
    const row = await db.getOne<{ id: string }>(
      `INSERT INTO locations (
        tenant_id, name, code, source, country, state, city, zip, street,
        parent_location_id, company_id, description
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      ) RETURNING id`,
      [
        tenantId, name, code, source || 'manual', country || null, state || null,
        city || null, zip || null, street || null, parent_location_id || null,
        company_id || null, description || null,
      ],
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch('/locations/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const {
      name, code, source, country, state, city, zip, street,
      parent_location_id, company_id, description, is_active,
    } = req.body;
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
    if (code !== undefined) { sets.push(`code = $${i++}`); vals.push(code); }
    if (source !== undefined) { sets.push(`source = $${i++}`); vals.push(source || 'manual'); }
    if (country !== undefined) { sets.push(`country = $${i++}`); vals.push(country || null); }
    if (state !== undefined) { sets.push(`state = $${i++}`); vals.push(state || null); }
    if (city !== undefined) { sets.push(`city = $${i++}`); vals.push(city || null); }
    if (zip !== undefined) { sets.push(`zip = $${i++}`); vals.push(zip || null); }
    if (street !== undefined) { sets.push(`street = $${i++}`); vals.push(street || null); }
    if (parent_location_id !== undefined) { sets.push(`parent_location_id = $${i++}`); vals.push(parent_location_id || null); }
    if (company_id !== undefined) { sets.push(`company_id = $${i++}`); vals.push(company_id || null); }
    if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description || null); }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }
    if (sets.length === 0) { res.json({ success: true }); return; }
    vals.push(req.params.id, tenantId);
    await db.query(`UPDATE locations SET ${sets.join(', ')} WHERE id = $${i++} AND tenant_id = $${i}`, vals);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
