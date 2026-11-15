/* SPDX-License-Identifier: AGPL-3.0-only */
import type { AddressInfo } from 'node:net';
import express, { type NextFunction, type Request, type Response } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    getOne: vi.fn(),
    getMany: vi.fn(),
    query: vi.fn(),
    withTenantContext: vi.fn(),
  },
  cache: {
    cacheDel: vi.fn(),
    cacheGetJson: vi.fn(),
    cacheSetJson: vi.fn(),
    cacheMetrics: vi.fn(),
    resetCacheMetrics: vi.fn(),
  },
}));

vi.mock('../../data/db', () => ({ db: mocks.db }));
vi.mock('../../cache/redis', () => mocks.cache);
vi.mock('../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/auth')>();
  return {
    ...actual,
    authenticate: (req: Request, res: Response, next: NextFunction) => {
      const header = req.header('x-test-user');
      if (!header) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      (req as unknown as { user: unknown }).user = JSON.parse(header);
      next();
    },
    setTenantRLS: (_req: Request, _res: Response, next: NextFunction) => next(),
    releaseTenantClient: (_req: Request, _res: Response, next: NextFunction) => next(),
  };
});

const { default: router, PUBLIC_THEME_KEYS } = await import('./routes');
const { errorHandler } = await import('../../middleware/errorHandler');

const TENANT = '11111111-1111-4111-8111-111111111111';
const admin = { id: 'u-admin', tenant_id: TENANT, roles: ['admin'] };

let baseUrl = '';
let server: ReturnType<express.Express['listen']>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/settings', router);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/settings`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cache.cacheGetJson.mockResolvedValue(null);
  mocks.db.withTenantContext.mockImplementation(
    (_tenantId: string, _userId: string, _roles: string, fn: () => Promise<unknown>) => fn(),
  );
});

function putSettings(settings: Record<string, unknown>) {
  return fetch(baseUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-test-user': JSON.stringify(admin) },
    body: JSON.stringify({ settings }),
  });
}

describe('GET /settings/theme', () => {
  it('only queries allowlisted branding keys', async () => {
    mocks.db.getMany.mockResolvedValue([{ key: 'app_name', value: 'Acme Desk' }]);

    const res = await fetch(`${baseUrl}/theme`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ settings: { app_name: 'Acme Desk' } });
    const [sql, params] = mocks.db.getMany.mock.calls[0];
    expect(sql).toContain('key = ANY($2::text[])');
    expect(params[1]).toEqual(PUBLIC_THEME_KEYS);
    expect(params[1]).not.toContain('inbound_webhook_secret');
  });

  it('uses a cache key separate from the admin settings map', async () => {
    mocks.db.getMany.mockResolvedValue([]);

    await fetch(`${baseUrl}/theme`);

    const [cacheKey] = mocks.cache.cacheGetJson.mock.calls[0];
    expect(cacheKey).toMatch(/^tenant-theme:/);
  });
});

describe('PUT /settings', () => {
  it('rejects keys outside the allowlist without writing anything', async () => {
    const res = await putSettings({ app_name: 'Acme', inbound_webhook_secret: 'leak-me' });

    expect(res.status).toBe(400);
    expect(mocks.db.query).not.toHaveBeenCalled();
  });

  it('rejects logo_url, which is managed by the logo endpoints', async () => {
    const res = await putSettings({ logo_url: '../../etc/passwd' });

    expect(res.status).toBe(400);
    expect(mocks.db.query).not.toHaveBeenCalled();
  });

  it('writes allowlisted keys and invalidates both caches', async () => {
    mocks.db.query.mockResolvedValue({ rows: [], rowCount: 1 });

    const res = await putSettings({ app_name: 'Acme', ai_triage_on_create: 'false' });

    expect(res.status).toBe(200);
    expect(mocks.db.query).toHaveBeenCalledTimes(2);
    const deletedKeys = mocks.cache.cacheDel.mock.calls.map(([key]) => key);
    expect(deletedKeys).toEqual(expect.arrayContaining([`tenant-settings:${TENANT}`, `tenant-theme:${TENANT}`]));
  });
});
