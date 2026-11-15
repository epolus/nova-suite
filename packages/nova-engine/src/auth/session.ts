/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Login sessions ───
// Access tokens are bound to a `user_sessions` row via the `sid` claim. The web
// app receives the token as an httpOnly cookie; API clients may still send it
// as a Bearer header.

import { randomUUID } from 'node:crypto';
import type { Request, Response, CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import type { PoolClient } from 'pg';
import { config } from '../config';
import { db } from '../data/db';
import { signAccessToken } from './jwt';
import type { AuthUser } from './types';

export const SESSION_COOKIE = 'nova_session';
const SESSION_COOKIE_PATH = '/api';

export type AuthMethod = 'password' | 'sso';

export type IssuedSession = {
  token: string;
  sessionId: string;
  expiresAt: Date;
};

/** Create a session row and sign an access token bound to it. */
export async function issueSession(req: Request, user: AuthUser, authMethod: AuthMethod): Promise<IssuedSession> {
  const sessionId = randomUUID();
  const token = signAccessToken({ ...user, sid: sessionId });
  const { exp } = jwt.decode(token) as { exp: number };
  const expiresAt = new Date(exp * 1000);
  const userAgent = req.get('user-agent')?.slice(0, 512) ?? null;

  await db.withTenantContext(user.tenant_id, user.id, user.roles.join(','), async (client) => {
    await client.query(
      `DELETE FROM user_sessions
       WHERE user_id = $1 AND (expires_at < now() OR revoked_at < now() - interval '1 day')`,
      [user.id],
    );
    await client.query(
      `INSERT INTO user_sessions (id, tenant_id, user_id, auth_method, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sessionId, user.tenant_id, user.id, authMethod, userAgent, req.ip ?? null, expiresAt],
    );
  });

  return { token, sessionId, expiresAt };
}

/** Revoke one session. Returns whether a live session was revoked. */
export async function revokeSession(client: PoolClient, sessionId: string): Promise<boolean> {
  const result = await client.query(
    'UPDATE user_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
    [sessionId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Revoke every live session of a user, optionally keeping one (the caller's own). */
export async function revokeUserSessions(
  client: PoolClient,
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  const result = await client.query(
    `UPDATE user_sessions SET revoked_at = now()
     WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [userId, exceptSessionId ?? null],
  );
  return result.rowCount ?? 0;
}

function cookieOptions(req: Request): CookieOptions {
  const mode = config.session.cookieSecure;
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: mode === 'auto' ? req.secure : mode === 'true',
    path: SESSION_COOKIE_PATH,
  };
}

export function setSessionCookie(req: Request, res: Response, session: Pick<IssuedSession, 'token' | 'expiresAt'>): void {
  res.cookie(SESSION_COOKIE, session.token, { ...cookieOptions(req), expires: session.expiresAt });
}

export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions(req));
}

export function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    if (!value) return undefined;
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export type TokenSource = 'bearer' | 'cookie';

/** Bearer header wins over the cookie so API clients are unaffected by a stray browser cookie. */
export function readAccessToken(req: Request): { token: string; source: TokenSource } | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    return token ? { token, source: 'bearer' } : null;
  }
  const cookie = readSessionCookie(req);
  return cookie ? { token: cookie, source: 'cookie' } : null;
}
