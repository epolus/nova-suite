/* SPDX-License-Identifier: AGPL-3.0-only */
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: { getOne: vi.fn(), getMany: vi.fn(), query: vi.fn(), withTenantTransaction: vi.fn() },
  startServiceNowMigration: vi.fn(),
  recordAuditEvent: vi.fn(),
  rlsContexts: [] as Array<{ tenantId: string; roles: string[] }>,
}));

vi.mock('../../../data/db', () => ({ db: mocks.db }));
vi.mock('../../../temporal/workflows', () => ({ startServiceNowMigration: mocks.startServiceNowMigration }));
vi.mock('../../../audit/events', () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock('../../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../middleware/auth')>();
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
    setTenantRLS: (req: Request, _res: Response, next: NextFunction) => {
      mocks.rlsContexts.push({ tenantId: req.user!.tenant_id, roles: req.user!.roles });
      (req as unknown as { _dbClient: unknown })._dbClient = { query: vi.fn() };
      next();
    },
    releaseTenantClient: (_req: Request, _res: Response, next: NextFunction) => next(),
  };
});

const { default: router } = await import('./routes');
const { errorHandler } = await import('../../../middleware/errorHandler');

const TENANT = '11111111-1111-4111-8111-111111111111';
const admin = { id: 'u-admin', tenant_id: TENANT, roles: ['admin'] };
const agent = { id: 'u-agent', tenant_id: TENANT, roles: ['agent'] };

let baseUrl = '';
let server: ReturnType<express.Express['listen']>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/admin/migrations/servicenow', router);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin/migrations/servicenow`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rlsContexts.length = 0;
});

function call(path: string, user: object | null, init: { method?: string; body?: unknown } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(user ? { 'x-test-user': JSON.stringify(user) } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

const runBody = { instance_url: 'acme', credential_slug: 'sn_prod', options: {} };

describe('ServiceNow migration routes: access control', () => {
  it('rejects unauthenticated requests', async () => {
    expect((await call('/runs', null)).status).toBe(401);
  });

  it.each([
    ['GET', '/runs'],
    ['POST', '/runs'],
    ['POST', '/test-connection'],
    ['GET', '/catalogs?instance_url=acme&credential_slug=sn_prod'],
    ['POST', '/runs/11111111-1111-4111-8111-111111111111/apply'],
  ])('forbids non-admins on %s %s', async (method, path) => {
    const res = await call(path, agent, { method, body: method === 'POST' ? runBody : undefined });
    expect(res.status).toBe(403);
    expect(mocks.rlsContexts).toEqual([]);
    expect(mocks.db.getOne).not.toHaveBeenCalled();
    expect(mocks.db.getMany).not.toHaveBeenCalled();
  });

  it('runs admin requests inside the tenant RLS context and filters by tenant', async () => {
    mocks.db.getMany.mockResolvedValue([]);
    const res = await call('/runs', admin);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ runs: [] });
    expect(mocks.rlsContexts).toEqual([{ tenantId: TENANT, roles: ['admin'] }]);
    expect(mocks.db.getMany.mock.calls[0][1]).toEqual([TENANT]);
  });
});

describe('ServiceNow migration routes: runs', () => {
  it('validates the credential slug', async () => {
    const res = await call('/runs', admin, { method: 'POST', body: { ...runBody, credential_slug: 'Bad Slug' } });
    expect(res.status).toBe(400);
    expect(mocks.db.getOne).not.toHaveBeenCalled();
  });

  it('requires the credential to exist in the vault', async () => {
    mocks.db.getOne.mockResolvedValueOnce(null);
    const res = await call('/runs', admin, { method: 'POST', body: runBody });
    expect(res.status).toBe(400);
    expect(mocks.startServiceNowMigration).not.toHaveBeenCalled();
  });

  it('refuses a second concurrent run', async () => {
    mocks.db.getOne.mockResolvedValueOnce({ '?column?': 1 }).mockResolvedValueOnce({ id: 'other' });
    const res = await call('/runs', admin, { method: 'POST', body: runBody });
    expect(res.status).toBe(409);
  });

  it('queues a run and starts the workflow', async () => {
    mocks.db.getOne
      .mockResolvedValueOnce({ '?column?': 1 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'run-1' });
    const res = await call('/runs', admin, { method: 'POST', body: runBody });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ id: 'run-1', status: 'queued' });
    expect(mocks.db.getOne.mock.calls[2][1]).toEqual(
      [TENANT, 'https://acme.service-now.com', 'sn_prod', expect.any(String), 'u-admin'],
    );
    expect(mocks.startServiceNowMigration).toHaveBeenCalledWith({ runId: 'run-1', tenantId: TENANT });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'servicenow_migration_started' }));
  });

  it('marks the run failed when Temporal is unavailable', async () => {
    mocks.db.getOne
      .mockResolvedValueOnce({ '?column?': 1 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'run-2' });
    mocks.startServiceNowMigration.mockRejectedValueOnce(new Error('down'));
    const res = await call('/runs', admin, { method: 'POST', body: runBody });
    expect(res.status).toBe(503);
    expect(mocks.db.query.mock.calls[0][0]).toContain("status = 'failed'");
  });

  it('returns 404 for malformed run ids', async () => {
    expect((await call('/runs/not-a-uuid', admin)).status).toBe(404);
    expect(mocks.db.getOne).not.toHaveBeenCalled();
  });

  it('only applies runs that are ready', async () => {
    const apply = () => call('/runs/11111111-1111-4111-8111-111111111111/apply', admin, {
      method: 'POST',
      body: { item_keys: ['sn/a'] },
    });
    mocks.db.getOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ status: 'extracting' });
    expect((await apply()).status).toBe(409);
    mocks.db.getOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    expect((await apply()).status).toBe(404);
    expect(mocks.db.withTenantTransaction).not.toHaveBeenCalled();
  });
});

describe('migration_runs table policy', () => {
  const sql = readFileSync(
    join(__dirname, '../../../../../../infra/postgres/migrations/v00.01.23__servicenow_migrator.sql'),
    'utf8',
  );

  it('forces RLS and restricts rows to admin and system roles of the tenant', () => {
    expect(sql).toMatch(/ALTER TABLE migration_runs FORCE ROW LEVEL SECURITY/);
    const policy = sql.slice(sql.indexOf('CREATE POLICY tenant_isolation_migration_runs'));
    expect(policy).toMatch(/USING \(\s*tenant_id = current_tenant_id\(\)/);
    expect(policy).toMatch(/WITH CHECK/);
    expect(policy.match(/current_user_has_role\('admin', 'system'\)/g)).toHaveLength(2);
  });
});
