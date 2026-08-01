/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Authentication Middleware ───
// JWT verification + RLS tenant context injection.

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { db } from '../data/db';
import { logger } from '../logger';

export interface AuthUser {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  time_format: '12h' | '24h';
  date_format: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  roles: string[];
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Verify JWT and attach user to request. */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  (req as { _requestStartedAt?: number })._requestStartedAt = Date.now();
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret) as AuthUser & { role?: string };

    // Normalise legacy tokens that carry a single `role` string instead of `roles[]`
    if (!Array.isArray(payload.roles)) {
      payload.roles = payload.role ? [payload.role] : ['user'];
    }
    if (!payload.time_format || (payload.time_format !== '12h' && payload.time_format !== '24h')) {
      payload.time_format = '24h';
    }
    if (!payload.date_format || !['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].includes(payload.date_format)) {
      payload.date_format = 'YYYY-MM-DD';
    }
    delete payload.role;

    // Always resolve roles from DB so role changes apply immediately
    // without requiring a new login/token issuance.
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
      [payload.id, payload.tenant_id],
    );
    payload.roles = roleRows.length > 0 ? roleRows.map((r) => r.name) : ['user'];

    req.user = payload;
    next();
  } catch (err) {
    logger.warn({ err }, 'JWT verification failed');
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Require that the user has at least one of the specified roles. */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const hasRole = req.user.roles.some((r) => roles.includes(r));
    if (!hasRole) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

/**
 * Middleware: set RLS tenant context for the duration of the request.
 * Must be used AFTER authenticate.
 */
export async function setTenantRLS(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    next();
    return;
  }

  try {
    // Set session-level GUC variables so RLS policies pick up the tenant
    const client = await db.getClient();
    try {
      await db.setTenantContext(client, req.user.tenant_id, req.user.id, req.user.roles.join(','));
      // Attach client to request for downstream use
      (req as any)._dbClient = client;
      (req as any)._dbClientAcquiredAt = Date.now();
      next();
    } catch (err) {
      client.release();
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware: release the per-request DB client after the response.
 * Must be used AFTER setTenantRLS.
 */
export function releaseTenantClient(req: Request, _res: Response, next: NextFunction): void {
  const client = (req as any)._dbClient;
  if (client) {
    // Clear tenant context and release when the response finishes
    _res.on('finish', () => {
      client.query(
        `SELECT set_config('app.current_tenant_id', '', false),
                set_config('app.current_user_id', '', false),
                set_config('app.current_user_roles', '', false)`,
      ).finally(() => client.release());
    });
  }
  next();
}

/** Helper: get the tenant-scoped DB client from the request. */
export function getRequestClient(req: Request) {
  const client = (req as any)._dbClient;
  if (!client) {
    throw new Error('No database client attached to request – did you use setTenantRLS middleware?');
  }
  return client;
}
