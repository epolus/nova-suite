/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Admin Routes ───
// User management, departments, cost centers, roles (admin only)

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../../data/db';
import { config } from '../../config';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { AppError } from '../../middleware/errorHandler';
import { checkTemporalHealth, startNotificationDispatch } from '../../temporal/workflows';
import { getWorkflowStartQueueStats } from '../../temporal/workflow-start-queue';
import { adminCreateUserSchema, adminUpdateUserSchema } from '../../domain/schemas';
import { recordAuditEvent } from '../../audit/events';
import { cacheMetrics } from '../../cache/redis';

const router = Router();

async function listAssignmentGroupsForTenant(tenantId: string) {
  return db.getMany(
    `SELECT ag.id, ag.name, ag.description, ag.is_active,
            ag.manager_id, ag.cost_center_id, ag.parent_group_id,
            ag.created_at, ag.updated_at,
            m.display_name AS manager_name,
            cc.name AS cost_center_name,
            cc.code AS cost_center_code,
            pg.name AS parent_group_name,
            (SELECT count(*) FROM assignment_group_members agm WHERE agm.group_id = ag.id)::int AS member_count,
            COALESCE(
              (SELECT json_agg(json_build_object('id', u.id, 'display_name', u.display_name) ORDER BY u.display_name)
               FROM assignment_group_members agm2
               JOIN users u ON u.id = agm2.user_id
               WHERE agm2.group_id = ag.id),
              '[]'::json
            ) AS members,
            COALESCE(
              (SELECT json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
               FROM assignment_group_processes agp
               JOIN processes p ON p.id = agp.process_id
               WHERE agp.group_id = ag.id),
              '[]'::json
            ) AS processes,
            COALESCE(
              (SELECT json_agg(json_build_object('id', r.id, 'name', r.name) ORDER BY r.name)
               FROM assignment_group_roles agr
               JOIN roles r ON r.id = agr.role_id
               WHERE agr.group_id = ag.id),
              '[]'::json
            ) AS roles
     FROM assignment_groups ag
     LEFT JOIN users m ON m.id = ag.manager_id
     LEFT JOIN cost_centers cc ON cc.id = ag.cost_center_id
     LEFT JOIN assignment_groups pg ON pg.id = ag.parent_group_id
     WHERE ag.tenant_id = $1
     ORDER BY ag.name`,
    [tenantId],
  );
}

// Read-only for admin + fulfiller (used by assignment pickers and task flows)
router.get(
  '/assignment-groups',
  authenticate,
  requireRole('admin', 'fulfiller'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await listAssignmentGroupsForTenant(req.user!.tenant_id);
      res.json({ assignment_groups: rows });
    } catch (err) { next(err); }
  },
);

// All admin routes require authentication + admin role
router.use(authenticate, requireRole('admin'));

router.use((req: Request, res: Response, next: NextFunction) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    next();
    return;
  }
  const startedAt = Date.now();
  res.on('finish', () => {
    void recordAuditEvent({
      tenantId: req.user!.tenant_id,
      actorUserId: req.user!.id,
      category: 'admin',
      action: `${req.method} ${req.baseUrl}${req.path}`,
      level: res.statusCode >= 400 ? 'warning' : 'info',
      metadata: {
        status: res.statusCode,
        duration_ms: Date.now() - startedAt,
      },
    });
  });
  next();
});

router.get('/audit-events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const limitRaw = Number.parseInt(String(req.query.limit || '100'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 500)) : 100;
    const rows = await db.getMany(
      `SELECT ae.id, ae.category, ae.action, ae.level, ae.entity_type, ae.entity_id,
              ae.metadata, ae.created_at, ae.actor_user_id, u.display_name AS actor_name
       FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.actor_user_id
       WHERE ae.tenant_id = $1
       ORDER BY ae.created_at DESC
       LIMIT $2`,
      [tenantId, limit],
    );
    res.json({ events: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/runtime-health', async (_req: Request, res: Response) => {
  const dbOk = await db.healthCheck();
  const schema = await db.checkSchemaCompatibility(config.db.expectedSchemaVersion);
  const redis = cacheMetrics() as { connected?: boolean; enabled?: boolean };
  const temporalOk = await checkTemporalHealth(2000);
  const queueStats = await getWorkflowStartQueueStats().catch(() => ({ pending: 0, failed: 0 }));
  const workerHeartbeat = await db.getOne<{ last_seen_at: string | null }>(
    'SELECT max(last_seen_at) AS last_seen_at FROM worker_heartbeats',
  ).catch(() => ({ last_seen_at: null }));
  const lastSeenAt = workerHeartbeat?.last_seen_at ? new Date(workerHeartbeat.last_seen_at).getTime() : null;
  const workerRecent = lastSeenAt !== null && Date.now() - lastSeenAt < 120_000;
  const status = dbOk && temporalOk && workerRecent && schema.ok ? 'healthy' : 'degraded';

  // Always return 200 for admin UI to avoid noisy browser fetch errors;
  // operational probes should continue using /health which returns 503 when degraded.
  res.json({
    status,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbOk ? 'connected' : 'disconnected',
      schema: schema.ok ? 'compatible' : 'mismatch',
      schema_expected_version: schema.expectedVersion,
      schema_actual_version: schema.actualVersion,
      schema_reason: schema.reason,
      redis: redis.enabled ? (redis.connected ? 'connected' : 'disconnected') : 'disabled',
      temporal: temporalOk ? 'connected' : 'disconnected',
      worker: workerRecent ? 'alive' : 'stale',
      workflow_start_queue_pending: queueStats.pending,
      workflow_start_queue_failed: queueStats.failed,
    },
  });
});

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

// ════════════════════════════════════════════
// DEPARTMENTS
// ════════════════════════════════════════════

router.get('/departments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany(
      `SELECT d.id, d.name, d.description, d.parent_department_id, d.cost_center_id, d.is_active, d.created_at, d.updated_at,
              pd.name AS parent_department_name,
              cc.name AS cost_center_name,
              cc.code AS cost_center_code,
              (SELECT count(*) FROM users u WHERE u.department_id = d.id AND u.is_active)::int AS user_count
       FROM departments d
       LEFT JOIN departments pd ON pd.id = d.parent_department_id
       LEFT JOIN cost_centers cc ON cc.id = d.cost_center_id
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
    const { name, description, parent_department_id, cost_center_id } = req.body;
    if (!name) throw new AppError(400, 'name is required');
    const parentDepartmentId = parent_department_id || null;
    const costCenterId = cost_center_id || null;
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
    const row = await db.getOne<{ id: string }>(
      'INSERT INTO departments (tenant_id, name, description, parent_department_id, cost_center_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [tenantId, name, description || null, parentDepartmentId, costCenterId],
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch('/departments/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { name, description, is_active, parent_department_id, cost_center_id } = req.body;
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
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
    if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description || null); }
    if (parent_department_id !== undefined) { sets.push(`parent_department_id = $${i++}`); vals.push(parent_department_id || null); }
    if (cost_center_id !== undefined) { sets.push(`cost_center_id = $${i++}`); vals.push(cost_center_id || null); }
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
              (SELECT count(*) FROM users u WHERE u.cost_center_id = cc.id AND u.is_active)::int AS user_count
       FROM cost_centers cc WHERE cc.tenant_id = $1 ORDER BY cc.code`,
      [tenantId],
    );
    res.json({ cost_centers: rows });
  } catch (err) { next(err); }
});

router.post('/cost-centers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { code, name, description } = req.body;
    if (!code || !name) throw new AppError(400, 'code and name are required');
    const row = await db.getOne<{ id: string }>(
      'INSERT INTO cost_centers (tenant_id, code, name, description) VALUES ($1, $2, $3, $4) RETURNING id',
      [tenantId, code, name, description || null],
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch('/cost-centers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { code, name, description, is_active } = req.body;
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (code !== undefined) { sets.push(`code = $${i++}`); vals.push(code); }
    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
    if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description || null); }
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

// ════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════

// ─── GET /api/admin/users ───
router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany(
      `SELECT
         u.id, u.user_id, u.email, u.first_name, u.last_name, u.display_name,
         u.title, u.phone, u.mobile, u.location, u.timezone, u.time_format, u.date_format,
         u.employee_type, u.company, c.name AS company_name, u.preferred_language,
         u.start_date, u.last_working_date,
         u.is_active, u.manager_id, u.department_id, u.cost_center_id,
         u.created_at, u.updated_at,
         m.display_name AS manager_name,
         d.name AS department_name,
         cc.name AS cost_center_name,
         cc.code AS cost_center_code,
         COALESCE(
           (
             SELECT array_agg(r.name ORDER BY r.name)
             FROM user_roles ur2
             JOIN roles r ON r.id = ur2.role_id
             WHERE ur2.user_id = u.id
               AND ur2.tenant_id = u.tenant_id
               AND r.tenant_id = u.tenant_id
           ),
           ARRAY[]::text[]
         ) AS roles,
         COALESCE(
           (
             SELECT json_agg(json_build_object('id', r.id, 'name', r.name) ORDER BY r.name)
             FROM user_roles ur3
             JOIN roles r ON r.id = ur3.role_id
             WHERE ur3.user_id = u.id
               AND ur3.tenant_id = u.tenant_id
               AND r.tenant_id = u.tenant_id
           ),
           '[]'::json
         ) AS role_details,
         COALESCE(
           (
             SELECT array_agg(DISTINCT r.name ORDER BY r.name)
             FROM assignment_group_members agm
             JOIN assignment_group_roles agr ON agr.group_id = agm.group_id
             JOIN roles r ON r.id = agr.role_id
             WHERE agm.user_id = u.id
               AND agm.tenant_id = u.tenant_id
               AND agr.tenant_id = u.tenant_id
               AND r.tenant_id = u.tenant_id
           ),
           ARRAY[]::text[]
         ) AS inherited_roles
       FROM users u
       LEFT JOIN users m ON m.id = u.manager_id
       LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN cost_centers cc ON cc.id = u.cost_center_id
      LEFT JOIN companies c ON c.id = u.company
       WHERE u.tenant_id = $1
       ORDER BY u.display_name`,
      [tenantId],
    );
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/admin/users/:id ───
router.patch('/users/:id', validateBody(adminUpdateUserSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.params.id;
    const {
      first_name, last_name, display_name, title: jobTitle,
      phone, mobile, location, timezone, employee_type, company,
      time_format, date_format,
      preferred_language, start_date, last_working_date,
      user_id, email, manager_id, department_id, cost_center_id,
      is_active, role_ids, password,
    } = req.body;

    // Verify user belongs to tenant
    const existing = await db.getOne<{ id: string }>(
      'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId],
    );
    if (!existing) throw new AppError(404, 'User not found');

    // Build dynamic UPDATE
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (first_name !== undefined) { sets.push(`first_name = $${idx++}`); values.push(first_name || null); }
    if (last_name !== undefined) { sets.push(`last_name = $${idx++}`); values.push(last_name || null); }
    if (display_name !== undefined) { sets.push(`display_name = $${idx++}`); values.push(display_name); }
    if (jobTitle !== undefined) { sets.push(`title = $${idx++}`); values.push(jobTitle || null); }
    if (phone !== undefined) { sets.push(`phone = $${idx++}`); values.push(phone || ''); }
    if (mobile !== undefined) { sets.push(`mobile = $${idx++}`); values.push(mobile || ''); }
    if (location !== undefined) { sets.push(`location = $${idx++}`); values.push(location || ''); }
    if (timezone !== undefined) { sets.push(`timezone = $${idx++}`); values.push(timezone || 'UTC'); }
    if (time_format !== undefined) { sets.push(`time_format = $${idx++}`); values.push(time_format); }
    if (date_format !== undefined) { sets.push(`date_format = $${idx++}`); values.push(date_format); }
    if (employee_type !== undefined) { sets.push(`employee_type = $${idx++}`); values.push(employee_type); }
    if (company !== undefined) { sets.push(`company = $${idx++}`); values.push(company || null); }
    if (preferred_language !== undefined) { sets.push(`preferred_language = $${idx++}`); values.push(preferred_language); }
    if (start_date !== undefined) { sets.push(`start_date = $${idx++}`); values.push(start_date || null); }
    if (last_working_date !== undefined) { sets.push(`last_working_date = $${idx++}`); values.push(last_working_date || null); }
    if (user_id !== undefined) { sets.push(`user_id = $${idx++}`); values.push(user_id || null); }
    if (email !== undefined) { sets.push(`email = $${idx++}`); values.push(email); }
    if (manager_id !== undefined) { sets.push(`manager_id = $${idx++}`); values.push(manager_id || null); }
    if (department_id !== undefined) { sets.push(`department_id = $${idx++}`); values.push(department_id || null); }
    if (cost_center_id !== undefined) { sets.push(`cost_center_id = $${idx++}`); values.push(cost_center_id || null); }
    if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); values.push(is_active); }

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      sets.push(`password_hash = $${idx++}`);
      values.push(hash);
    }

    if (sets.length > 0) {
      values.push(userId);
      await db.query(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}`,
        values,
      );
    }

    // Update roles if provided
    if (Array.isArray(role_ids)) {
      await db.query('DELETE FROM user_roles WHERE user_id = $1 AND tenant_id = $2', [userId, tenantId]);
      for (const roleId of role_ids) {
        await db.query(
          'INSERT INTO user_roles (tenant_id, user_id, role_id, granted_by) VALUES ($1, $2, $3, $4)',
          [tenantId, userId, roleId, req.user!.id],
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/users ───
router.post('/users', validateBody(adminCreateUserSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const {
      email, password, first_name, last_name, display_name,
      title: jobTitle, phone, mobile, location, timezone, time_format, date_format, employee_type,
      company, preferred_language, start_date, last_working_date,
      user_id, manager_id, department_id, cost_center_id, role_ids,
    } = req.body;

    if (!email || !password || !display_name) {
      throw new AppError(400, 'email, password, and display_name are required');
    }

    const existing = await db.getOne('SELECT id FROM users WHERE tenant_id = $1 AND email = $2', [tenantId, email]);
    if (existing) throw new AppError(409, 'A user with this email already exists');

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await db.getOne<{ id: string }>(
      `INSERT INTO users (
        tenant_id, user_id, email, password_hash,
        first_name, last_name, display_name, title,
          phone, mobile, location, timezone, time_format, date_format,
        employee_type, company, preferred_language,
        start_date, last_working_date,
        manager_id, department_id, cost_center_id
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, $16, $17,
          $18, $19,
          $20, $21, $22
      ) RETURNING id`,
      [
        tenantId, user_id || null, email, passwordHash,
        first_name || null, last_name || null, display_name, jobTitle || null,
        phone || '', mobile || '', location || 'Zurich', timezone || 'UTC', time_format || '24h', date_format || 'YYYY-MM-DD',
        employee_type || 'employee', company || null, preferred_language || 'en',
        start_date || null, last_working_date || null,
        manager_id || null, department_id || null, cost_center_id || null,
      ],
    );

    if (Array.isArray(role_ids)) {
      for (const roleId of role_ids) {
        await db.query(
          'INSERT INTO user_roles (tenant_id, user_id, role_id, granted_by) VALUES ($1, $2, $3, $4)',
          [tenantId, newUser!.id, roleId, req.user!.id],
        );
      }
    }

    res.status(201).json({ id: newUser!.id });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/admin/users/:id ───
router.delete('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.params.id;

    if (userId === req.user!.id) {
      throw new AppError(400, 'You cannot delete your own account');
    }

    const user = await db.getOne('SELECT id FROM users WHERE id = $1 AND tenant_id = $2', [userId, tenantId]);
    if (!user) throw new AppError(404, 'User not found');

    // Check for dependent data
    const incidentCount = await db.getOne<{ count: number }>(
      'SELECT count(*)::int AS count FROM incidents WHERE (caller_id = $1 OR assigned_to = $1) AND tenant_id = $2',
      [userId, tenantId],
    );
    if (incidentCount && incidentCount.count > 0) {
      throw new AppError(409, `Cannot delete: user is referenced by ${incidentCount.count} incident(s). Deactivate the user instead.`);
    }

    await db.query('DELETE FROM user_roles WHERE user_id = $1 AND tenant_id = $2', [userId, tenantId]);
    await db.query('DELETE FROM users WHERE id = $1 AND tenant_id = $2', [userId, tenantId]);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════
// PROCESSES
// ════════════════════════════════════════════

router.get('/processes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany(
      `SELECT p.id, p.name, p.description, p.is_active, p.created_at, p.updated_at,
              (SELECT count(*) FROM assignment_group_processes agp WHERE agp.process_id = p.id)::int AS group_count
       FROM processes p WHERE p.tenant_id = $1 ORDER BY p.name`,
      [tenantId],
    );
    res.json({ processes: rows });
  } catch (err) { next(err); }
});

router.post('/processes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { name, description } = req.body;
    if (!name) throw new AppError(400, 'name is required');
    const row = await db.getOne<{ id: string }>(
      'INSERT INTO processes (tenant_id, name, description) VALUES ($1, $2, $3) RETURNING id',
      [tenantId, name, description || null],
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch('/processes/:id', async (req: Request, res: Response, next: NextFunction) => {
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
    await db.query(`UPDATE processes SET ${sets.join(', ')} WHERE id = $${i++} AND tenant_id = $${i}`, vals);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// ASSIGNMENT GROUPS
// ════════════════════════════════════════════

router.post('/assignment-groups', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { name, description, manager_id, cost_center_id, parent_group_id, member_ids, process_ids, role_ids } = req.body;
    if (!name) throw new AppError(400, 'name is required');

    const row = await db.getOne<{ id: string }>(
      `INSERT INTO assignment_groups (tenant_id, name, description, manager_id, cost_center_id, parent_group_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [tenantId, name, description || null, manager_id || null, cost_center_id || null, parent_group_id || null],
    );

    const groupId = row!.id;

    if (Array.isArray(member_ids)) {
      for (const uid of member_ids) {
        await db.query(
          'INSERT INTO assignment_group_members (tenant_id, group_id, user_id) VALUES ($1, $2, $3)',
          [tenantId, groupId, uid],
        );
      }
    }

    if (Array.isArray(process_ids)) {
      for (const pid of process_ids) {
        await db.query(
          'INSERT INTO assignment_group_processes (tenant_id, group_id, process_id) VALUES ($1, $2, $3)',
          [tenantId, groupId, pid],
        );
      }
    }

    if (Array.isArray(role_ids)) {
      for (const rid of role_ids) {
        await db.query(
          'INSERT INTO assignment_group_roles (tenant_id, group_id, role_id) VALUES ($1, $2, $3)',
          [tenantId, groupId, rid],
        );
      }
    }

    res.status(201).json({ id: groupId });
  } catch (err) { next(err); }
});

router.patch('/assignment-groups/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const groupId = req.params.id;
    const {
      name, description, manager_id, cost_center_id, parent_group_id, is_active, member_ids, process_ids, role_ids,
    } = req.body;

    const existing = await db.getOne<{ id: string }>(
      'SELECT id FROM assignment_groups WHERE id = $1 AND tenant_id = $2',
      [groupId, tenantId],
    );
    if (!existing) throw new AppError(404, 'Assignment group not found');

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
    if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description || null); }
    if (manager_id !== undefined) { sets.push(`manager_id = $${i++}`); vals.push(manager_id || null); }
    if (cost_center_id !== undefined) { sets.push(`cost_center_id = $${i++}`); vals.push(cost_center_id || null); }
    if (parent_group_id !== undefined) { sets.push(`parent_group_id = $${i++}`); vals.push(parent_group_id || null); }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }

    if (sets.length > 0) {
      vals.push(groupId);
      await db.query(`UPDATE assignment_groups SET ${sets.join(', ')} WHERE id = $${i}`, vals);
    }

    if (Array.isArray(member_ids)) {
      await db.query('DELETE FROM assignment_group_members WHERE group_id = $1 AND tenant_id = $2', [groupId, tenantId]);
      for (const uid of member_ids) {
        await db.query(
          'INSERT INTO assignment_group_members (tenant_id, group_id, user_id) VALUES ($1, $2, $3)',
          [tenantId, groupId, uid],
        );
      }
    }

    if (Array.isArray(process_ids)) {
      await db.query('DELETE FROM assignment_group_processes WHERE group_id = $1 AND tenant_id = $2', [groupId, tenantId]);
      for (const pid of process_ids) {
        await db.query(
          'INSERT INTO assignment_group_processes (tenant_id, group_id, process_id) VALUES ($1, $2, $3)',
          [tenantId, groupId, pid],
        );
      }
    }

    if (Array.isArray(role_ids)) {
      await db.query('DELETE FROM assignment_group_roles WHERE group_id = $1 AND tenant_id = $2', [groupId, tenantId]);
      for (const rid of role_ids) {
        await db.query(
          'INSERT INTO assignment_group_roles (tenant_id, group_id, role_id) VALUES ($1, $2, $3)',
          [tenantId, groupId, rid],
        );
      }
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// SERVICES (IT/Business services)
// ════════════════════════════════════════════

router.get('/services', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany(
      `SELECT id, name, description, is_active, created_at, updated_at
       FROM services WHERE tenant_id = $1 ORDER BY name`,
      [tenantId],
    );
    res.json({ services: rows });
  } catch (err) { next(err); }
});

router.post('/services', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { name, description } = req.body;
    if (!name) throw new AppError(400, 'name is required');
    const row = await db.getOne<{ id: string }>(
      'INSERT INTO services (tenant_id, name, description) VALUES ($1, $2, $3) RETURNING id',
      [tenantId, name, description || null],
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch('/services/:id', async (req: Request, res: Response, next: NextFunction) => {
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
    await db.query(`UPDATE services SET ${sets.join(', ')} WHERE id = $${i++} AND tenant_id = $${i}`, vals);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// SLA DEFINITIONS
// ════════════════════════════════════════════

router.get('/sla-definitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany(
      `SELECT sd.*, svc.name AS condition_service_name
       FROM sla_definitions sd
       LEFT JOIN services svc ON svc.id = sd.condition_service_id
       WHERE sd.tenant_id = $1
       ORDER BY sd.sort_order, sd.name`,
      [tenantId],
    );
    res.json({ sla_definitions: rows });
  } catch (err) { next(err); }
});

router.post('/sla-definitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const {
      name, description, process_type,
      condition_priority, condition_impact, condition_urgency,
      condition_category, condition_service_id,
      resolution_hours, response_hours, auto_close_days, warning_pct,
      on_warning, on_breach, sort_order,
    } = req.body;

    if (!name) throw new AppError(400, 'name is required');
    if (!resolution_hours) throw new AppError(400, 'resolution_hours is required');

    const row = await db.getOne<{ id: string }>(
      `INSERT INTO sla_definitions (
        tenant_id, name, description, process_type,
        condition_priority, condition_impact, condition_urgency,
        condition_category, condition_service_id,
        resolution_hours, response_hours, auto_close_days, warning_pct,
        on_warning, on_breach, sort_order
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING id`,
      [
        tenantId, name, description || null, process_type || 'incident',
        condition_priority ?? null, condition_impact || null, condition_urgency || null,
        condition_category || null, condition_service_id || null,
        resolution_hours, response_hours ?? null, auto_close_days ?? 7, warning_pct ?? 80,
        JSON.stringify(on_warning || []), JSON.stringify(on_breach || []),
        sort_order ?? 100,
      ],
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch('/sla-definitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const {
      name, description, process_type,
      condition_priority, condition_impact, condition_urgency,
      condition_category, condition_service_id,
      resolution_hours, response_hours, auto_close_days, warning_pct,
      on_warning, on_breach, is_active, sort_order,
    } = req.body;

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
    if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description || null); }
    if (process_type !== undefined) { sets.push(`process_type = $${i++}`); vals.push(process_type); }
    if (condition_priority !== undefined) { sets.push(`condition_priority = $${i++}`); vals.push(condition_priority); }
    if (condition_impact !== undefined) { sets.push(`condition_impact = $${i++}`); vals.push(condition_impact || null); }
    if (condition_urgency !== undefined) { sets.push(`condition_urgency = $${i++}`); vals.push(condition_urgency || null); }
    if (condition_category !== undefined) { sets.push(`condition_category = $${i++}`); vals.push(condition_category || null); }
    if (condition_service_id !== undefined) { sets.push(`condition_service_id = $${i++}`); vals.push(condition_service_id || null); }
    if (resolution_hours !== undefined) { sets.push(`resolution_hours = $${i++}`); vals.push(resolution_hours); }
    if (response_hours !== undefined) { sets.push(`response_hours = $${i++}`); vals.push(response_hours); }
    if (auto_close_days !== undefined) { sets.push(`auto_close_days = $${i++}`); vals.push(auto_close_days); }
    if (warning_pct !== undefined) { sets.push(`warning_pct = $${i++}`); vals.push(warning_pct); }
    if (on_warning !== undefined) { sets.push(`on_warning = $${i++}`); vals.push(JSON.stringify(on_warning)); }
    if (on_breach !== undefined) { sets.push(`on_breach = $${i++}`); vals.push(JSON.stringify(on_breach)); }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }
    if (sort_order !== undefined) { sets.push(`sort_order = $${i++}`); vals.push(sort_order); }

    if (sets.length === 0) { res.json({ success: true }); return; }

    vals.push(req.params.id, tenantId);
    await db.query(
      `UPDATE sla_definitions SET ${sets.join(', ')} WHERE id = $${i++} AND tenant_id = $${i}`,
      vals,
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/sla-definitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    await db.query('DELETE FROM sla_definitions WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// NOTIFICATION RULES
// ════════════════════════════════════════════

type NotificationRuleChannel = 'in_app' | 'email';
type NotificationRuleTemplateInput = {
  locale: string;
  title_template: string;
  body_template: string | null;
  body_html_template: string | null;
};

function normalizeNotificationChannels(raw: unknown): NotificationRuleChannel[] {
  if (raw === undefined || raw === null) return ['in_app'];
  if (!Array.isArray(raw)) throw new AppError(400, 'channels must be an array');
  const allowed = new Set<NotificationRuleChannel>(['in_app', 'email']);
  const channels = Array.from(new Set(raw.map((v) => String(v).trim())))
    .filter((v): v is NotificationRuleChannel => allowed.has(v as NotificationRuleChannel));
  if (channels.length === 0) throw new AppError(400, 'at least one valid channel is required');
  return channels;
}

function normalizeNotificationTemplates(raw: unknown, legacyTitle?: unknown, legacyBody?: unknown): NotificationRuleTemplateInput[] {
  if (!Array.isArray(raw)) {
    const fallbackTitle = String(legacyTitle || '').trim();
    if (!fallbackTitle) throw new AppError(400, 'title_template is required');
    const fallbackBody = legacyBody == null ? null : String(legacyBody);
    return [{
      locale: 'en',
      title_template: fallbackTitle,
      body_template: fallbackBody,
      body_html_template: null,
    }];
  }

  const seen = new Set<string>();
  const templates: NotificationRuleTemplateInput[] = [];
  for (const entry of raw as Array<Record<string, unknown>>) {
    const locale = String(entry.locale || '').trim().toLowerCase();
    const titleTemplate = String(entry.title_template || '').trim();
    if (!locale) throw new AppError(400, 'template locale is required');
    if (!/^[a-z]{2}(?:-[a-z]{2})?$/.test(locale)) {
      throw new AppError(400, `unsupported locale format "${locale}"`);
    }
    if (!titleTemplate) throw new AppError(400, `title_template is required for locale "${locale}"`);
    if (seen.has(locale)) throw new AppError(400, `duplicate locale "${locale}" in templates`);
    seen.add(locale);
    templates.push({
      locale,
      title_template: titleTemplate,
      body_template: entry.body_template == null ? null : String(entry.body_template),
      body_html_template: entry.body_html_template == null ? null : String(entry.body_html_template),
    });
  }
  if (templates.length === 0) throw new AppError(400, 'at least one template locale is required');
  return templates;
}

function ensureEmailTemplateBodies(templates: NotificationRuleTemplateInput[]) {
  for (const template of templates) {
    if (!template.body_template || !template.body_template.trim()) {
      throw new AppError(400, `body_template is required for email template locale "${template.locale}"`);
    }
  }
}

async function loadNotificationRuleTemplates(tenantId: string, ruleId: string): Promise<NotificationRuleTemplateInput[]> {
  const rows = await db.getMany<NotificationRuleTemplateInput>(
    `SELECT locale, title_template, body_template, body_html_template
     FROM notification_rule_templates
     WHERE tenant_id = $1 AND notification_rule_id = $2
     ORDER BY locale`,
    [tenantId, ruleId],
  );
  return rows;
}

async function upsertNotificationRuleTemplates(
  tenantId: string,
  ruleId: string,
  templates: NotificationRuleTemplateInput[],
): Promise<void> {
  await db.query(
    `DELETE FROM notification_rule_templates
     WHERE tenant_id = $1 AND notification_rule_id = $2`,
    [tenantId, ruleId],
  );
  for (const template of templates) {
    await db.query(
      `INSERT INTO notification_rule_templates (
        tenant_id, notification_rule_id, locale, title_template, body_template, body_html_template
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tenantId,
        ruleId,
        template.locale,
        template.title_template,
        template.body_template,
        template.body_html_template,
      ],
    );
  }
}

router.get('/notification-rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany(
      `SELECT nr.*,
              u.display_name AS recipient_user_name,
              ag.name AS recipient_group_name,
              COALESCE(
                (
                  SELECT json_agg(
                    json_build_object(
                      'locale', nrt.locale,
                      'title_template', nrt.title_template,
                      'body_template', nrt.body_template,
                      'body_html_template', nrt.body_html_template
                    )
                    ORDER BY nrt.locale
                  )
                  FROM notification_rule_templates nrt
                  WHERE nrt.tenant_id = nr.tenant_id
                    AND nrt.notification_rule_id = nr.id
                ),
                '[]'::json
              ) AS templates
       FROM notification_rules nr
       LEFT JOIN users u ON u.id = nr.recipient_user_id
       LEFT JOIN assignment_groups ag ON ag.id = nr.recipient_group_id
       WHERE nr.tenant_id = $1
       ORDER BY nr.sort_order, nr.name`,
      [tenantId],
    );
    res.json({ notification_rules: rows });
  } catch (err) { next(err); }
});

router.post('/notification-rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const {
      name, description, entity_type, trigger_key, recipient_type,
      recipient_user_id, recipient_group_id, title_template, body_template, sort_order, channels, templates,
    } = req.body;

    if (!name) throw new AppError(400, 'name is required');
    if (!trigger_key) throw new AppError(400, 'trigger_key is required');
    if (!recipient_type) throw new AppError(400, 'recipient_type is required');

    if (recipient_type === 'specific_user' && !recipient_user_id) {
      throw new AppError(400, 'recipient_user_id is required for specific_user');
    }
    if (recipient_type === 'assignment_group_members' && !recipient_group_id) {
      throw new AppError(400, 'recipient_group_id is required for assignment_group_members');
    }

    const normalizedChannels = normalizeNotificationChannels(channels);
    const normalizedTemplates = normalizeNotificationTemplates(templates, title_template, body_template);
    if (normalizedChannels.includes('email')) ensureEmailTemplateBodies(normalizedTemplates);
    const defaultTemplate = normalizedTemplates.find((template) => template.locale === 'en') || normalizedTemplates[0];

    const row = await db.getOne<{ id: string }>(
      `INSERT INTO notification_rules (
        tenant_id, name, description, entity_type, trigger_key, recipient_type,
        recipient_user_id, recipient_group_id, channels, title_template, body_template, sort_order
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12
      ) RETURNING id`,
      [
        tenantId,
        name,
        description || null,
        entity_type || 'incident',
        trigger_key,
        recipient_type,
        recipient_user_id || null,
        recipient_group_id || null,
        normalizedChannels,
        defaultTemplate.title_template,
        defaultTemplate.body_template,
        sort_order ?? 100,
      ],
    );
    await upsertNotificationRuleTemplates(tenantId, row!.id, normalizedTemplates);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch('/notification-rules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const ruleId = String(req.params.id);
    const {
      name, description, entity_type, trigger_key, recipient_type,
      recipient_user_id, recipient_group_id, title_template, body_template,
      is_active, sort_order, channels, templates,
    } = req.body;

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
    if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description || null); }
    if (entity_type !== undefined) { sets.push(`entity_type = $${i++}`); vals.push(entity_type); }
    if (trigger_key !== undefined) { sets.push(`trigger_key = $${i++}`); vals.push(trigger_key); }
    if (recipient_type !== undefined) { sets.push(`recipient_type = $${i++}`); vals.push(recipient_type); }
    if (recipient_user_id !== undefined) { sets.push(`recipient_user_id = $${i++}`); vals.push(recipient_user_id || null); }
    if (recipient_group_id !== undefined) { sets.push(`recipient_group_id = $${i++}`); vals.push(recipient_group_id || null); }
    if (channels !== undefined) {
      const normalizedChannels = normalizeNotificationChannels(channels);
      sets.push(`channels = $${i++}::text[]`);
      vals.push(normalizedChannels);
    }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }
    if (sort_order !== undefined) { sets.push(`sort_order = $${i++}`); vals.push(sort_order); }

    let normalizedTemplates: NotificationRuleTemplateInput[] | null = null;
    if (templates !== undefined || title_template !== undefined || body_template !== undefined) {
      normalizedTemplates = normalizeNotificationTemplates(
        templates,
        title_template,
        body_template,
      );
      const defaultTemplate = normalizedTemplates.find((template) => template.locale === 'en') || normalizedTemplates[0];
      sets.push(`title_template = $${i++}`);
      vals.push(defaultTemplate.title_template);
      sets.push(`body_template = $${i++}`);
      vals.push(defaultTemplate.body_template);
    }

    if (sets.length === 0 && !normalizedTemplates) { res.json({ success: true }); return; }

    vals.push(ruleId, tenantId);
    const result = await db.query(
      `UPDATE notification_rules
       SET ${sets.join(', ')}
       WHERE id = $${i++} AND tenant_id = $${i}`,
      vals,
    );
    if (result.rowCount === 0) throw new AppError(404, 'Notification rule not found');

    if (normalizedTemplates) {
      await upsertNotificationRuleTemplates(tenantId, ruleId, normalizedTemplates);
    }

    const activeChannels = channels !== undefined
      ? normalizeNotificationChannels(channels)
      : (
        await db.getOne<{ channels: NotificationRuleChannel[] }>(
          'SELECT channels FROM notification_rules WHERE id = $1 AND tenant_id = $2',
          [ruleId, tenantId],
        )
      )?.channels || ['in_app'];

    if (activeChannels.includes('email')) {
      const effectiveTemplates = normalizedTemplates || await loadNotificationRuleTemplates(tenantId, ruleId);
      if (effectiveTemplates.length === 0) {
        throw new AppError(400, 'at least one locale template is required when email channel is enabled');
      }
      ensureEmailTemplateBodies(effectiveTemplates);
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/notification-rules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    await db.query(
      'DELETE FROM notification_rules WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId],
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/notification-rules/:id/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rule = await db.getOne<{
      id: string;
      entity_type: 'incident' | 'request' | 'change' | 'problem' | 'knowledge';
      trigger_key: string;
    }>(
      `SELECT id, entity_type, trigger_key
       FROM notification_rules
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    if (!rule) throw new AppError(404, 'Notification rule not found');

    let entityId = String(req.body?.entity_id || '').trim();
    if (!entityId) {
      const latestEntityByType: Record<string, string> = {
        incident: 'SELECT id FROM incidents WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
        request: 'SELECT id FROM requests WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
        change: 'SELECT id FROM changes WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
        problem: 'SELECT id FROM problems WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
        knowledge: 'SELECT id FROM knowledge_articles WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
      };
      const entityQuery = latestEntityByType[rule.entity_type];
      if (!entityQuery) throw new AppError(400, 'Unsupported entity type for test');
      const latest = await db.getOne<{ id: string }>(entityQuery, [tenantId]);
      if (!latest?.id) {
        throw new AppError(400, `No ${rule.entity_type} records available to test this rule`);
      }
      entityId = latest.id;
    }

    const workflowId = await startNotificationDispatch({
      tenantId,
      entityType: rule.entity_type,
      triggerKey: rule.trigger_key,
      entityId,
      actorUserId: req.user!.id,
    });

    res.json({ success: true, workflow_id: workflowId, entity_id: entityId });
  } catch (err) { next(err); }
});

router.get('/notification-email-deliveries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const status = String(req.query.status || '').trim();
    const triggerKey = String(req.query.trigger_key || '').trim();
    const recipient = String(req.query.recipient || '').trim();
    const limitRaw = Number.parseInt(String(req.query.limit || '100'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 500)) : 100;

    const filters: string[] = ['ned.tenant_id = $1'];
    const vals: unknown[] = [tenantId];
    let i = 2;

    if (status) {
      filters.push(`ned.status = $${i++}`);
      vals.push(status);
    }
    if (triggerKey) {
      filters.push(`ned.trigger_key = $${i++}`);
      vals.push(triggerKey);
    }
    if (recipient) {
      filters.push(`LOWER(ned.recipient_email) LIKE $${i++}`);
      vals.push(`%${recipient.toLowerCase()}%`);
    }

    const filterWhereClause = filters.join(' AND ');
    const filterValues = [...vals];

    vals.push(limit);
    const rows = await db.getMany(
      `SELECT
         ned.id,
         ned.notification_rule_id,
         nr.name AS notification_rule_name,
         ned.recipient_user_id,
         u.display_name AS recipient_user_name,
         ned.recipient_email,
         ned.recipient_locale,
         ned.entity_type,
         ned.entity_id,
         ned.trigger_key,
         ned.template_locale,
         ned.subject,
         ned.body_text,
         ned.body_html,
         ned.status,
         ned.provider,
         ned.provider_message_id,
         ned.retry_count,
         ned.last_error,
         ned.sent_at,
         ned.created_at,
         ned.updated_at
       FROM notification_email_deliveries ned
       LEFT JOIN notification_rules nr ON nr.id = ned.notification_rule_id
       LEFT JOIN users u ON u.id = ned.recipient_user_id
       WHERE ${filterWhereClause}
       ORDER BY ned.created_at DESC
       LIMIT $${i}`,
      vals,
    );

    const summary = await db.getMany<{ status: string; count: number }>(
      `SELECT status, count(*)::int AS count
       FROM notification_email_deliveries ned
       WHERE ${filterWhereClause}
       GROUP BY status
       ORDER BY status`,
      filterValues,
    );

    res.json({ deliveries: rows, summary });
  } catch (err) { next(err); }
});

// ════════════════════════════════════════════
// WORKFLOW BUILDER DEFINITIONS
// ════════════════════════════════════════════

type WorkflowDefinitionRow = {
  id: string;
  name: string;
  workflow_type: string;
  draft_definition: Record<string, unknown>;
  published_definition: Record<string, unknown> | null;
  version: number;
  is_active: boolean;
  draft_updated_at: string;
  published_at: string | null;
  published_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

router.get('/workflow-definitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany<WorkflowDefinitionRow>(
      `SELECT id, name, workflow_type, draft_definition, published_definition,
              version, is_active, draft_updated_at, published_at, published_by, created_by, created_at, updated_at
       FROM workflow_definitions
       WHERE tenant_id = $1
       ORDER BY updated_at DESC`,
      [tenantId],
    );
    res.json({ workflow_definitions: rows });
  } catch (err) { next(err); }
});

router.get('/workflow-definitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const row = await db.getOne<WorkflowDefinitionRow>(
      `SELECT id, name, workflow_type, draft_definition, published_definition,
              version, is_active, draft_updated_at, published_at, published_by, created_by, created_at, updated_at
       FROM workflow_definitions
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    if (!row) throw new AppError(404, 'Workflow definition not found');
    res.json({ workflow_definition: row });
  } catch (err) { next(err); }
});

router.post('/workflow-definitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    const { name, workflow_type, draft_definition } = req.body as {
      name?: string;
      workflow_type?: string;
      draft_definition?: Record<string, unknown>;
    };

    if (!name?.trim()) throw new AppError(400, 'name is required');
    if (!workflow_type?.trim()) throw new AppError(400, 'workflow_type is required');

    const row = await db.getOne<{ id: string }>(
      `INSERT INTO workflow_definitions
        (tenant_id, name, workflow_type, draft_definition, created_by, draft_updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, now())
       RETURNING id`,
      [
        tenantId,
        name.trim(),
        workflow_type.trim(),
        JSON.stringify(draft_definition ?? {}),
        userId,
      ],
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch('/workflow-definitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const {
      name,
      workflow_type,
      draft_definition,
      is_active,
    } = req.body as {
      name?: string;
      workflow_type?: string;
      draft_definition?: Record<string, unknown>;
      is_active?: boolean;
    };

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name.trim()); }
    if (workflow_type !== undefined) { sets.push(`workflow_type = $${i++}`); vals.push(workflow_type.trim()); }
    if (draft_definition !== undefined) {
      sets.push(`draft_definition = $${i++}::jsonb`);
      sets.push(`draft_updated_at = now()`);
      vals.push(JSON.stringify(draft_definition));
    }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }

    if (sets.length === 0) { res.json({ success: true }); return; }

    vals.push(req.params.id, tenantId);
    const result = await db.query(
      `UPDATE workflow_definitions
       SET ${sets.join(', ')}
       WHERE id = $${i++} AND tenant_id = $${i}`,
      vals,
    );
    if (result.rowCount === 0) throw new AppError(404, 'Workflow definition not found');
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/workflow-definitions/:id/publish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    const { draft_definition } = req.body as { draft_definition?: Record<string, unknown> };

    const sets = [
      `published_definition = COALESCE($1::jsonb, draft_definition)`,
      `published_at = now()`,
      `published_by = $2`,
      `version = version + 1`,
    ];
    const vals: unknown[] = [
      draft_definition !== undefined ? JSON.stringify(draft_definition) : null,
      userId,
      req.params.id,
      tenantId,
    ];

    const result = await db.query(
      `UPDATE workflow_definitions
       SET ${sets.join(', ')}
       WHERE id = $3 AND tenant_id = $4`,
      vals,
    );
    if (result.rowCount === 0) throw new AppError(404, 'Workflow definition not found');
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/workflow-definitions/:id/duplicate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    const source = await db.getOne<WorkflowDefinitionRow>(
      `SELECT id, name, workflow_type, draft_definition, published_definition,
              version, is_active, draft_updated_at, published_at, published_by, created_by, created_at, updated_at
       FROM workflow_definitions
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    if (!source) throw new AppError(404, 'Workflow definition not found');

    const duplicateName = `${source.name} (copy)`;
    const row = await db.getOne<{ id: string }>(
      `INSERT INTO workflow_definitions
        (tenant_id, name, workflow_type, draft_definition, created_by, draft_updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, now())
       RETURNING id`,
      [tenantId, duplicateName, source.workflow_type, JSON.stringify(source.draft_definition), userId],
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
});

export default router;
