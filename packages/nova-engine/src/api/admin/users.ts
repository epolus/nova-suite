/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Admin: Users ───

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../../data/db';
import { config } from '../../config';
import { getRequestClient } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { AppError } from '../../middleware/errorHandler';
import { adminCreateUserSchema, adminUpdateUserSchema } from '../../domain/schemas';
import { revokeUserSessions } from '../../auth/session';

const router = Router();

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
         u.is_active, u.locked_out, u.locked_at, u.lock_reason,
         u.failed_login_count, u.last_failed_login_at, u.last_login_at,
         u.vip, u.employee_number, u.source,
         u.manager_id, u.department_id, u.cost_center_id,
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
      vip, employee_number, locked_out, lock_reason,
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
    if (phone !== undefined) { sets.push(`phone = $${idx++}`); values.push(phone || null); }
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
    if (vip !== undefined) { sets.push(`vip = $${idx++}`); values.push(vip); }
    if (employee_number !== undefined) { sets.push(`employee_number = $${idx++}`); values.push(employee_number || null); }
    if (locked_out === true) {
      const reason = typeof lock_reason === 'string' && lock_reason.trim() ? lock_reason.trim() : 'admin';
      sets.push('locked_out = true');
      sets.push('locked_at = CASE WHEN locked_out THEN locked_at ELSE now() END');
      sets.push(`lock_reason = $${idx++}`);
      values.push(reason);
    } else if (locked_out === false) {
      sets.push('locked_out = false');
      sets.push('locked_at = CASE WHEN locked_out THEN NULL ELSE locked_at END');
      sets.push('lock_reason = CASE WHEN locked_out THEN NULL ELSE lock_reason END');
      sets.push('failed_login_count = CASE WHEN locked_out THEN 0 ELSE failed_login_count END');
    }

    if (password) {
      const hash = await bcrypt.hash(password, config.auth.bcryptRounds);
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

    if (is_active === false || locked_out === true || password) {
      const keepSession = userId === req.user!.id ? req.user!.sid : undefined;
      await revokeUserSessions(getRequestClient(req), String(userId), keepSession);
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
      vip, employee_number, locked_out, lock_reason,
    } = req.body;

    if (!email || !password || !display_name) {
      throw new AppError(400, 'email, password, and display_name are required');
    }

    const existing = await db.getOne('SELECT id FROM users WHERE tenant_id = $1 AND email = $2', [tenantId, email]);
    if (existing) throw new AppError(409, 'A user with this email already exists');

    const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);

    const newUser = await db.getOne<{ id: string }>(
      `INSERT INTO users (
        tenant_id, user_id, email, password_hash,
        first_name, last_name, display_name, title,
          phone, mobile, location, timezone, time_format, date_format,
        employee_type, company, preferred_language,
        start_date, last_working_date,
        manager_id, department_id, cost_center_id,
        vip, employee_number, locked_out, locked_at, lock_reason, source
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, $16, $17,
          $18, $19,
          $20, $21, $22,
          $23, $24, $25, CASE WHEN $25 THEN now() ELSE NULL END, $26, 'manual'
      ) RETURNING id`,
      [
        tenantId, user_id || null, email, passwordHash,
        first_name || null, last_name || null, display_name, jobTitle || null,
        phone || null, mobile || '', location || 'Zurich', timezone || 'UTC', time_format || '24h', date_format || 'YYYY-MM-DD',
        employee_type || 'employee', company || null, preferred_language || 'en',
        start_date || null, last_working_date || null,
        manager_id || null, department_id || null, cost_center_id || null,
        vip === true,
        employee_number || null,
        locked_out === true,
        locked_out === true ? ((typeof lock_reason === 'string' && lock_reason.trim()) ? lock_reason.trim() : 'admin') : null,
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

export default router;
