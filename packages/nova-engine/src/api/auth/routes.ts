/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Auth Routes ───
// POST /api/auth/login
// POST /api/auth/register   (admin only)
// GET  /api/auth/me

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { db } from '../../data/db';
import { loginSchema, registerSchema } from '../../domain/schemas';
import { validateBody } from '../../middleware/validate';
import { authenticate, requireRole, AuthUser } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { recordAuditEvent } from '../../audit/events';

const router = Router();

// ─── POST /api/auth/login ───
router.post(
  '/login',
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!config.auth.localLoginEnabled) {
        throw new AppError(403, 'Local login is disabled. Please sign in with SSO.');
      }

      const { email, password } = req.body;

      // Find user (bypass RLS – login is pre-auth)
      const user = await db.getOne<{
        id: string;
        tenant_id: string;
        email: string;
        password_hash: string;
        display_name: string;
        time_format: '12h' | '24h';
        date_format: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
        is_active: boolean;
      }>(
        'SELECT id, tenant_id, email, password_hash, display_name, time_format, date_format, is_active FROM users WHERE email = $1',
        [email],
      );

      if (!user || !user.is_active) {
        if (user?.tenant_id) {
          void recordAuditEvent({
            tenantId: user.tenant_id,
            actorUserId: user.id,
            category: 'auth',
            action: 'auth.login.failed',
            level: 'warning',
            metadata: { email, reason: 'inactive_or_unknown' },
          });
        }
        throw new AppError(401, 'Invalid email or password');
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        void recordAuditEvent({
          tenantId: user.tenant_id,
          actorUserId: user.id,
          category: 'auth',
          action: 'auth.login.failed',
          level: 'warning',
          metadata: { email, reason: 'invalid_password' },
        });
        throw new AppError(401, 'Invalid email or password');
      }

      // Fetch roles for this user
      const roleRows = await db.getMany<{ name: string }>(
        `SELECT DISTINCT r.name
         FROM roles r
         JOIN (
           SELECT ur.role_id
           FROM user_roles ur
           WHERE ur.user_id = $1
             AND ur.tenant_id = $2
           UNION
           SELECT agr.role_id
           FROM assignment_group_members agm
           JOIN assignment_group_roles agr ON agr.group_id = agm.group_id
           WHERE agm.user_id = $1
             AND agm.tenant_id = $2
             AND agr.tenant_id = $2
         ) src ON src.role_id = r.id
         WHERE r.tenant_id = $2
         ORDER BY r.name`,
        [user.id, user.tenant_id],
      );
      const roles = roleRows.map((r) => r.name);

      const payload: AuthUser = {
        id: user.id,
        tenant_id: user.tenant_id,
        email: user.email,
        display_name: user.display_name,
        time_format: user.time_format || '24h',
        date_format: user.date_format || 'YYYY-MM-DD',
        roles: roles.length > 0 ? roles : ['user'],
      };

      const token = jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn,
      } as jwt.SignOptions);

      res.json({
        token,
        user: payload,
      });
      void recordAuditEvent({
        tenantId: user.tenant_id,
        actorUserId: user.id,
        category: 'auth',
        action: 'auth.login.success',
        metadata: { method: 'password' },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/auth/register (admin only) ───
router.post(
  '/register',
  authenticate,
  requireRole('admin'),
  validateBody(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        email, password, first_name, last_name, display_name,
        title: jobTitle, phone, mobile, location, timezone, time_format, date_format, employee_type,
        company, preferred_language, start_date, last_working_date,
        user_id, manager_id, department_id, cost_center_id, role_ids,
      } = req.body;
      const tenantId = req.user!.tenant_id;

      // Check for duplicate
      const existing = await db.getOne('SELECT id FROM users WHERE tenant_id = $1 AND email = $2', [
        tenantId,
        email,
      ]);
      if (existing) {
        throw new AppError(409, 'A user with this email already exists');
      }

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
          phone || null, mobile || null, location || 'Zurich', timezone || 'UTC', time_format || '24h', date_format || 'YYYY-MM-DD',
          employee_type || 'employee', company || null, preferred_language || 'en',
          start_date || null, last_working_date || null,
          manager_id || null, department_id || null, cost_center_id || null,
        ],
      );

      // Assign roles
      if (role_ids && role_ids.length > 0) {
        for (const roleId of role_ids) {
          await db.query(
            `INSERT INTO user_roles (tenant_id, user_id, role_id, granted_by)
             VALUES ($1, $2, $3, $4)`,
            [tenantId, newUser!.id, roleId, req.user!.id],
          );
        }
      }

      // Fetch assigned role names
      const roleRows = await db.getMany<{ name: string }>(
        `SELECT r.name FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1`,
        [newUser!.id],
      );

      res.status(201).json({
        id: newUser!.id,
        email,
        display_name,
        user_id: user_id || null,
        roles: roleRows.map((r) => r.name),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/auth/me ───
router.get('/me', authenticate, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

// ─── PATCH /api/auth/me/time-format ───
router.patch('/me/time-format', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const value = req.body?.time_format;
    if (value !== '12h' && value !== '24h') {
      throw new AppError(400, 'time_format must be either "12h" or "24h"');
    }

    await db.query(
      'UPDATE users SET time_format = $1 WHERE id = $2 AND tenant_id = $3',
      [value, req.user!.id, req.user!.tenant_id],
    );

    req.user = { ...req.user!, time_format: value };
    res.json({ user: req.user });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/auth/me/date-format ───
router.patch('/me/date-format', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const value = req.body?.date_format;
    if (!['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].includes(value)) {
      throw new AppError(400, 'date_format must be one of "DD.MM.YYYY", "MM/DD/YYYY", or "YYYY-MM-DD"');
    }

    await db.query(
      'UPDATE users SET date_format = $1 WHERE id = $2 AND tenant_id = $3',
      [value, req.user!.id, req.user!.tenant_id],
    );

    req.user = { ...req.user!, date_format: value };
    res.json({ user: req.user });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/auth/me/preferences/:scope ───
router.get('/me/preferences/:scope', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scope = String(req.params.scope || '').trim();
    if (!scope || scope.length > 120 || !/^[a-zA-Z0-9:_-]+$/.test(scope)) {
      throw new AppError(400, 'Invalid preference scope');
    }

    const row = await db.getOne<{ value: Record<string, unknown> }>(
      `SELECT value
       FROM user_preferences
       WHERE tenant_id = $1
         AND user_id = $2
         AND scope = $3`,
      [req.user!.tenant_id, req.user!.id, scope],
    );

    res.json({ preference: row?.value ?? null });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/auth/me/preferences/:scope ───
router.put('/me/preferences/:scope', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scope = String(req.params.scope || '').trim();
    if (!scope || scope.length > 120 || !/^[a-zA-Z0-9:_-]+$/.test(scope)) {
      throw new AppError(400, 'Invalid preference scope');
    }
    const value = req.body?.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new AppError(400, 'Preference value must be an object');
    }

    await db.query(
      `INSERT INTO user_preferences (tenant_id, user_id, scope, value)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (tenant_id, user_id, scope)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [req.user!.tenant_id, req.user!.id, scope, JSON.stringify(value)],
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/auth/users (for user_ref dropdowns) ───
router.get(
  '/users',
  authenticate,
  requireRole('admin', 'fulfiller', 'user'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tenant_id;
      const result = await db.getMany(
        `SELECT u.id, u.email, u.display_name, u.user_id,
                COALESCE(
                  array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL),
                  ARRAY[]::text[]
                ) AS roles
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
         WHERE u.tenant_id = $1 AND u.is_active = true
         GROUP BY u.id
         ORDER BY u.display_name`,
        [tenantId],
      );
      res.json({ users: result });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
