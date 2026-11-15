/* SPDX-License-Identifier: AGPL-3.0-only */
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyAccessToken, resolveSessionAccess } = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  resolveSessionAccess: vi.fn(),
}));

vi.mock('../auth/jwt', () => ({ verifyAccessToken }));
vi.mock('../data/db', () => ({ db: { resolveSessionAccess } }));

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

describe('authenticate', () => {
  beforeEach(() => {
    verifyAccessToken.mockReset().mockReturnValue({ ...TOKEN_PAYLOAD });
    resolveSessionAccess.mockReset();
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

  it('accepts the session cookie when there is no Bearer header', async () => {
    resolveSessionAccess.mockResolvedValue(LIVE);
    const ctx = call({ cookie: 'other=1; nova_session=cookie-token' });
    await ctx.run();
    expect(verifyAccessToken).toHaveBeenCalledWith('cookie-token');
    expect(ctx.next).toHaveBeenCalledWith();
  });

  it('prefers the Bearer header over the cookie', async () => {
    resolveSessionAccess.mockResolvedValue(LIVE);
    const ctx = call({ authorization: 'Bearer header-token', cookie: 'nova_session=cookie-token' });
    await ctx.run();
    expect(verifyAccessToken).toHaveBeenCalledWith('header-token');
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
