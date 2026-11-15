/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../data/db', () => ({ db: {} }));
vi.mock('./jwt', () => ({ signAccessToken: (payload: unknown) => payload }));

import { newSessionId, setSessionCookie } from './session';

describe('setSessionCookie', () => {
  it('stores the session id, not an access token', () => {
    const cookie = vi.fn();
    const res = { cookie } as unknown as Response;
    const req = { secure: true } as Request;
    const sessionId = newSessionId();
    const expiresAt = new Date('2026-12-01T00:00:00Z');

    setSessionCookie(req, res, sessionId, expiresAt);

    expect(cookie).toHaveBeenCalledWith('nova_session', sessionId, expect.objectContaining({
      httpOnly: true,
      sameSite: 'lax',
      path: '/api',
      expires: expiresAt,
    }));
    expect(String(cookie.mock.calls[0]?.[1])).not.toContain('.');
  });
});
