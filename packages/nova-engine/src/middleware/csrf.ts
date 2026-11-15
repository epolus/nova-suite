/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – CSRF origin check ───
// The session cookie is sent automatically by browsers, so state-changing
// requests that rely on it must come from our own origin. Bearer-only clients
// (scripts, integrations) and unauthenticated webhooks are not affected.

import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { readSessionCookie } from '../auth/session';
import { logger } from '../logger';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Endpoints that establish a session; a forged login would sign the victim into the attacker's account.
const SESSION_ESTABLISHING_PATHS = new Set(['/auth/login', '/auth/sso/exchange']);

function requestOrigin(req: Request): string | null {
  const origin = req.get('origin');
  if (origin) return origin;
  const referer = req.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function isTrustedOrigin(req: Request, origin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.origin === 'null') return false;
  const host = req.get('host')?.toLowerCase();
  if (host && parsed.host.toLowerCase() === host) return true;
  return config.session.trustedOrigins.includes(parsed.origin.toLowerCase());
}

function usesSessionCookie(req: Request): boolean {
  return !req.headers.authorization?.startsWith('Bearer ') && readSessionCookie(req) !== undefined;
}

export function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }
  if (!usesSessionCookie(req) && !SESSION_ESTABLISHING_PATHS.has(req.path)) {
    next();
    return;
  }

  const origin = requestOrigin(req);
  if (origin && isTrustedOrigin(req, origin)) {
    next();
    return;
  }
  // Login without Origin/Referer (e.g. curl) is fine as long as no session cookie rides along.
  if (!origin && !usesSessionCookie(req)) {
    next();
    return;
  }

  logger.warn({ method: req.method, path: req.path, origin }, 'Rejected cross-origin request');
  res.status(403).json({ error: 'Cross-origin request rejected' });
}
