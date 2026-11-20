/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Authentication Middleware ───
// JWT verification + RLS tenant context injection.

import { Request, Response, NextFunction } from 'express';
import type { PoolClient } from 'pg';
import { verifyAccessToken } from '../auth/jwt';
import { isSessionId, readCredential } from '../auth/session';
import type { AuthUser } from '../auth/types';
import { db } from '../data/db';
import { logger } from '../logger';

export type { AuthUser } from '../auth/types';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** Per-request tenant-scoped DB client attached by setTenantRLS. */
      _dbClient?: PoolClient;
      /** Epoch ms when `_dbClient` was acquired (timing / Server-Timing). */
      _dbClientAcquiredAt?: number;
    }
  }
}

const DATE_FORMATS = ['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const;

type AuthLookup =
  | { kind: 'user'; user: AuthUser }
  | { kind: 'reject'; status: number; error: string }
  | { kind: 'anonymous' };

/** The cookie is a session id. Load the user from that row; there is no token to verify. */
async function lookupCookieUser(sessionId: string): Promise<AuthLookup> {
  if (!isSessionId(sessionId)) {
    return { kind: 'reject', status: 401, error: 'Session expired, please sign in again' };
  }

  const access = await db.lookupSessionUser(sessionId);
  if (!access) {
    return { kind: 'reject', status: 401, error: 'Session expired, please sign in again' };
  }
  if (!access.is_active) {
    return { kind: 'reject', status: 401, error: 'Account is inactive' };
  }
  if (!access.session_valid) {
    return { kind: 'reject', status: 401, error: 'Session expired, please sign in again' };
  }

  const dateFormat = DATE_FORMATS.find((format) => format === access.date_format) ?? 'YYYY-MM-DD';
  return {
    kind: 'user',
    user: {
      id: access.id,
      tenant_id: access.tenant_id,
      email: access.email,
      display_name: access.display_name,
      time_format: access.time_format === '12h' ? '12h' : '24h',
      date_format: dateFormat,
      roles: access.roles.length > 0 ? access.roles : ['user'],
      sid: sessionId,
    },
  };
}

async function lookupBearerUser(token: string, source: string): Promise<AuthLookup> {
  let payload: ReturnType<typeof verifyAccessToken>;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    logger.warn({ err, source }, 'JWT verification failed');
    return { kind: 'reject', status: 401, error: 'Invalid or expired token' };
  }
  // Tokens issued before server-side sessions existed cannot be revoked; make them log in again.
  if (typeof payload.sid !== 'string' || !payload.sid) {
    return { kind: 'reject', status: 401, error: 'Session expired, please sign in again' };
  }

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

  // Resolve roles, the active flag and the session from the DB on every request so
  // role changes, deactivation and logout apply without waiting for the token to expire.
  // Lockout is not checked here: failed logins set it, and must not end live sessions.
  const access = await db.resolveSessionAccess(payload.sid, payload.id, payload.tenant_id);
  if (!access || !access.is_active) {
    return { kind: 'reject', status: 401, error: 'Account is inactive' };
  }
  if (!access.session_valid) {
    return { kind: 'reject', status: 401, error: 'Session expired, please sign in again' };
  }
  payload.roles = access.roles.length > 0 ? access.roles : ['user'];
  return { kind: 'user', user: payload };
}

async function resolveAuth(req: Request): Promise<AuthLookup> {
  const credential = readCredential(req);
  if (!credential) return { kind: 'anonymous' };
  if (credential.source === 'cookie') {
    return lookupCookieUser(credential.sessionId);
  }
  return lookupBearerUser(credential.token, credential.source);
}

function markRequestStart(req: Request): void {
  (req as { _requestStartedAt?: number })._requestStartedAt = Date.now();
}

/** Verify the session cookie or Bearer token and attach the user to the request. */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  markRequestStart(req);
  let lookup: AuthLookup;
  try {
    lookup = await resolveAuth(req);
  } catch (err) {
    next(err);
    return;
  }
  if (lookup.kind === 'user') {
    req.user = lookup.user;
    next();
    return;
  }
  if (lookup.kind === 'anonymous') {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.status(lookup.status).json({ error: lookup.error });
}

/**
 * Like authenticate, but missing/invalid credentials continue without `req.user`
 * instead of returning 401. Used by the session probe so anonymous page loads
 * do not produce a console-logged failed fetch.
 */
export async function authenticateOptional(req: Request, _res: Response, next: NextFunction): Promise<void> {
  markRequestStart(req);
  delete req.user;
  let lookup: AuthLookup;
  try {
    lookup = await resolveAuth(req);
  } catch (err) {
    next(err);
    return;
  }
  if (lookup.kind === 'user') {
    req.user = lookup.user;
  }
  next();
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
      req._dbClient = client;
      req._dbClientAcquiredAt = Date.now();
      db.bindRequestClient(client, () => next());
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
  const client = req._dbClient;
  if (client) {
    // Clear tenant context and release when the response finishes
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      void db.releaseTenantClient(client);
    };
    // `close` fires on abort; `finish` does not. Guard so a normal
    // response (which emits both) only releases once.
    _res.once('close', release);
    _res.once('finish', release);
  }
  next();
}

/** Helper: get the tenant-scoped DB client from the request. */
export function getRequestClient(req: Request): PoolClient {
  const client = req._dbClient;
  if (!client) {
    throw new Error('No database client attached to request – did you use setTenantRLS middleware?');
  }
  return client;
}
