/* SPDX-License-Identifier: AGPL-3.0-only */
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyAccessToken, resolveUserAccess } = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  resolveUserAccess: vi.fn(),
}));

vi.mock('../auth/jwt', () => ({ verifyAccessToken }));
vi.mock('../data/db', () => ({ db: { resolveUserAccess } }));

import { authenticate } from './auth';

function call(authorization?: string) {
  const req = { headers: authorization ? { authorization } : {} } as Request;
  const json = vi.fn();
  const res = { status: vi.fn(() => ({ json })) } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
  return { req, res, json, next, run: () => authenticate(req, res, next) };
}

const TOKEN_PAYLOAD = {
  id: 'u1',
  tenant_id: 't1',
  email: 'a@example.com',
  display_name: 'A',
  roles: ['admin'],
  time_format: '24h',
  date_format: 'YYYY-MM-DD',
};

describe('authenticate', () => {
  beforeEach(() => {
    verifyAccessToken.mockReset().mockReturnValue({ ...TOKEN_PAYLOAD });
    resolveUserAccess.mockReset();
  });

  it('uses roles from the database, not the token', async () => {
    resolveUserAccess.mockResolvedValue({ is_active: true, roles: ['fulfiller'] });
    const ctx = call('Bearer t');
    await ctx.run();
    expect(ctx.next).toHaveBeenCalledWith();
    expect(ctx.req.user?.roles).toEqual(['fulfiller']);
    expect(resolveUserAccess).toHaveBeenCalledWith('u1', 't1');
  });

  it('falls back to the user role when none are assigned', async () => {
    resolveUserAccess.mockResolvedValue({ is_active: true, roles: [] });
    const ctx = call('Bearer t');
    await ctx.run();
    expect(ctx.req.user?.roles).toEqual(['user']);
  });

  it('rejects deactivated or deleted users with a valid token', async () => {
    for (const access of [{ is_active: false, roles: ['admin'] }, null]) {
      resolveUserAccess.mockResolvedValue(access);
      const ctx = call('Bearer t');
      await ctx.run();
      expect(ctx.res.status).toHaveBeenCalledWith(401);
      expect(ctx.next).not.toHaveBeenCalled();
    }
  });

  it('passes database errors on instead of logging the user out', async () => {
    const dbError = new Error('connection refused');
    resolveUserAccess.mockRejectedValue(dbError);
    const ctx = call('Bearer t');
    await ctx.run();
    expect(ctx.next).toHaveBeenCalledWith(dbError);
    expect(ctx.res.status).not.toHaveBeenCalled();
  });

  it('rejects invalid tokens without touching the database', async () => {
    verifyAccessToken.mockImplementation(() => { throw new Error('jwt expired'); });
    const ctx = call('Bearer t');
    await ctx.run();
    expect(ctx.res.status).toHaveBeenCalledWith(401);
    expect(resolveUserAccess).not.toHaveBeenCalled();
  });
});
