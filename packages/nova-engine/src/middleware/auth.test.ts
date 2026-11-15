/* SPDX-License-Identifier: AGPL-3.0-only */
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyAccessToken, resolveSessionAccess, lookupSessionUser } = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  resolveSessionAccess: vi.fn(),
  lookupSessionUser: vi.fn(),
}));

vi.mock('../auth/jwt', () => ({ verifyAccessToken }));
vi.mock('../data/db', () => ({ db: { resolveSessionAccess, lookupSessionUser } }));

import { authenticate } from './auth';

function call(headers: Record<string, string> = { authorization: 'Bearer t' }) {
  const req = { headers } as Request;
  const json = vi.fn();
  const res = { status: vi.fn(() => ({ json })) } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
  return { req, res, json, next, run: () => authenticate(req, res, next) };
}

const TOKEN_PAYLOAD = {
  id: 'u1',
  tenant_id: 't1',
  sid: 's1',
  email: 'a@example.com',
  display_name: 'A',
  roles: ['admin'],
  time_format: '24h',
  date_format: 'YYYY-MM-DD',
};

const LIVE = { is_active: true, roles: ['fulfiller'], session_valid: true };
const SESSION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const COOKIE_USER = {
  id: 'u1',
  tenant_id: 't1',
  email: 'a@example.com',
  display_name: 'A',
  time_format: '24h' as const,
  date_format: 'YYYY-MM-DD' as const,
  ...LIVE,
};

describe('authenticate', () => {
  beforeEach(() => {
    verifyAccessToken.mockReset().mockReturnValue({ ...TOKEN_PAYLOAD });
    resolveSessionAccess.mockReset();
    lookupSessionUser.mockReset();
  });

  it('uses roles from the database, not the token', async () => {
    resolveSessionAccess.mockResolvedValue(LIVE);
    const ctx = call();
    await ctx.run();
    expect(ctx.next).toHaveBeenCalledWith();
    expect(ctx.req.user?.roles).toEqual(['fulfiller']);
    expect(resolveSessionAccess).toHaveBeenCalledWith('s1', 'u1', 't1');
  });

  it('falls back to the user role when none are assigned', async () => {
    resolveSessionAccess.mockResolvedValue({ ...LIVE, roles: [] });
    const ctx = call();
    await ctx.run();
    expect(ctx.req.user?.roles).toEqual(['user']);
  });

  it('loads the user from the session id in the cookie and does not treat it as a token', async () => {
    lookupSessionUser.mockResolvedValue(COOKIE_USER);
    const ctx = call({ cookie: `other=1; nova_session=${SESSION_ID}` });
    await ctx.run();
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(lookupSessionUser).toHaveBeenCalledWith(SESSION_ID);
    expect(resolveSessionAccess).not.toHaveBeenCalled();
    expect(ctx.next).toHaveBeenCalledWith();
    expect(ctx.req.user).toMatchObject({ id: 'u1', sid: SESSION_ID, roles: ['fulfiller'] });
  });

  it('rejects a cookie that is not a session id', async () => {
    const ctx = call({ cookie: 'nova_session=eyJhbGciOiJSUzI1NiJ9.payload.sig' });
    await ctx.run();
    expect(ctx.res.status).toHaveBeenCalledWith(401);
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(lookupSessionUser).not.toHaveBeenCalled();
  });

  it('rejects an unknown, revoked or inactive cookie session', async () => {
    lookupSessionUser.mockResolvedValueOnce(null);
    const missing = call({ cookie: `nova_session=${SESSION_ID}` });
    await missing.run();
    expect(missing.json).toHaveBeenCalledWith({ error: 'Session expired, please sign in again' });

    lookupSessionUser.mockResolvedValueOnce({ ...COOKIE_USER, session_valid: false });
    const revoked = call({ cookie: `nova_session=${SESSION_ID}` });
    await revoked.run();
    expect(revoked.json).toHaveBeenCalledWith({ error: 'Session expired, please sign in again' });

    lookupSessionUser.mockResolvedValueOnce({ ...COOKIE_USER, is_active: false });
    const inactive = call({ cookie: `nova_session=${SESSION_ID}` });
    await inactive.run();
    expect(inactive.json).toHaveBeenCalledWith({ error: 'Account is inactive' });
  });

  it('passes cookie lookup errors on instead of logging the user out', async () => {
    const dbError = new Error('connection refused');
    lookupSessionUser.mockRejectedValue(dbError);
    const ctx = call({ cookie: `nova_session=${SESSION_ID}` });
    await ctx.run();
    expect(ctx.next).toHaveBeenCalledWith(dbError);
    expect(ctx.res.status).not.toHaveBeenCalled();
  });

  it('prefers the Bearer header over the cookie', async () => {
    resolveSessionAccess.mockResolvedValue(LIVE);
    const ctx = call({ authorization: 'Bearer header-token', cookie: `nova_session=${SESSION_ID}` });
    await ctx.run();
    expect(verifyAccessToken).toHaveBeenCalledWith('header-token');
    expect(lookupSessionUser).not.toHaveBeenCalled();
  });

  it('rejects requests without any credential', async () => {
    const ctx = call({});
    await ctx.run();
    expect(ctx.res.status).toHaveBeenCalledWith(401);
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects deactivated or deleted users with a valid token', async () => {
    for (const access of [{ ...LIVE, is_active: false }, null]) {
      resolveSessionAccess.mockResolvedValue(access);
      const ctx = call();
      await ctx.run();
      expect(ctx.res.status).toHaveBeenCalledWith(401);
      expect(ctx.next).not.toHaveBeenCalled();
    }
  });

  it('rejects revoked or expired sessions', async () => {
    resolveSessionAccess.mockResolvedValue({ ...LIVE, session_valid: false });
    const ctx = call();
    await ctx.run();
    expect(ctx.res.status).toHaveBeenCalledWith(401);
    expect(ctx.next).not.toHaveBeenCalled();
  });

  it('rejects tokens issued without a session id', async () => {
    const { sid: _sid, ...legacy } = TOKEN_PAYLOAD;
    verifyAccessToken.mockReturnValue(legacy);
    const ctx = call();
    await ctx.run();
    expect(ctx.res.status).toHaveBeenCalledWith(401);
    expect(resolveSessionAccess).not.toHaveBeenCalled();
  });

  it('passes database errors on instead of logging the user out', async () => {
    const dbError = new Error('connection refused');
    resolveSessionAccess.mockRejectedValue(dbError);
    const ctx = call();
    await ctx.run();
    expect(ctx.next).toHaveBeenCalledWith(dbError);
    expect(ctx.res.status).not.toHaveBeenCalled();
  });

  it('rejects invalid tokens without touching the database', async () => {
    verifyAccessToken.mockImplementation(() => { throw new Error('jwt expired'); });
    const ctx = call();
    await ctx.run();
    expect(ctx.res.status).toHaveBeenCalledWith(401);
    expect(resolveSessionAccess).not.toHaveBeenCalled();
  });
});
