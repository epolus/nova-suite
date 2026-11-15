/* SPDX-License-Identifier: AGPL-3.0-only */
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../config', () => ({
  config: { session: { cookieSecure: 'auto', trustedOrigins: ['https://portal.example.com'] } },
}));
vi.mock('../logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('../data/db', () => ({ db: {} }));
vi.mock('../auth/jwt', () => ({ signAccessToken: vi.fn() }));

import { requireSameOrigin } from './csrf';

function call(method: string, path: string, headers: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const req = {
    method,
    path,
    headers: lower,
    get: (name: string) => lower[name.toLowerCase()],
  } as unknown as Request;
  const json = vi.fn();
  const res = { status: vi.fn(() => ({ json })) } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
  requireSameOrigin(req, res, next);
  return { res, next };
}

const COOKIE = { host: 'nova.example.com', cookie: 'nova_session=abc' };

describe('requireSameOrigin', () => {
  it('lets safe methods through', () => {
    const { next } = call('GET', '/incidents', { ...COOKIE, origin: 'https://evil.example' });
    expect(next).toHaveBeenCalled();
  });

  it('allows cookie writes from the same host', () => {
    const { next } = call('POST', '/incidents', { ...COOKIE, origin: 'https://nova.example.com' });
    expect(next).toHaveBeenCalled();
  });

  it('falls back to the Referer origin', () => {
    const { next } = call('PATCH', '/incidents/1', { ...COOKIE, referer: 'https://nova.example.com/incidents/1' });
    expect(next).toHaveBeenCalled();
  });

  it('allows configured trusted origins', () => {
    const { next } = call('POST', '/incidents', { ...COOKIE, origin: 'https://portal.example.com' });
    expect(next).toHaveBeenCalled();
  });

  it('rejects cookie writes from another origin or without one', () => {
    for (const extra of [{ origin: 'https://evil.example' }, { origin: 'null' }, {}]) {
      const { res, next } = call('DELETE', '/incidents/1', { ...COOKIE, ...extra });
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('does not restrict Bearer clients or unauthenticated webhooks', () => {
    expect(call('POST', '/incidents', {
      host: 'nova.example.com', authorization: 'Bearer x', cookie: 'nova_session=abc', origin: 'https://evil.example',
    }).next).toHaveBeenCalled();
    expect(call('POST', '/webhooks/inbound', { host: 'nova.example.com', origin: 'https://evil.example' }).next)
      .toHaveBeenCalled();
  });

  it('blocks cross-origin login but allows scripted login without an Origin', () => {
    expect(call('POST', '/auth/login', { host: 'nova.example.com', origin: 'https://evil.example' }).res.status)
      .toHaveBeenCalledWith(403);
    expect(call('POST', '/auth/login', { host: 'nova.example.com' }).next).toHaveBeenCalled();
  });
});
