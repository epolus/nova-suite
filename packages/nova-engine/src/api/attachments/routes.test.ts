/* SPDX-License-Identifier: AGPL-3.0-only */
import type { AddressInfo } from 'node:net';
import express, { type NextFunction, type Request, type Response } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const INCIDENT_ID = '22222222-2222-4222-8222-222222222222';
const ARTICLE_ID = '33333333-3333-4333-8333-333333333333';
const ATTACHMENT_ID = '44444444-4444-4444-8444-444444444444';

const state = vi.hoisted(() => ({
  visibleIncidents: new Set<string>(),
  articleStatus: null as string | null,
  attachment: null as Record<string, unknown> | null,
  queries: [] as string[],
}));

const fakeClient = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    state.queries.push(sql);
    if (sql.startsWith('SELECT 1 FROM incidents')) {
      const visible = state.visibleIncidents.has(params[0] as string);
      return { rows: visible ? [{}] : [], rowCount: visible ? 1 : 0 };
    }
    if (sql.startsWith('SELECT status FROM knowledge_articles')) {
      return state.articleStatus
        ? { rows: [{ status: state.articleStatus }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (sql.startsWith('SELECT * FROM attachments')) {
      return state.attachment ? { rows: [state.attachment], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  }),
};

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
    setTenantRLS: (req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { _dbClient: unknown })._dbClient = fakeClient;
      next();
    },
    releaseTenantClient: (_req: Request, _res: Response, next: NextFunction) => next(),
  };
});

const { default: router } = await import('./routes');
const { errorHandler } = await import('../../middleware/errorHandler');

const essUser = { id: 'u-ess', tenant_id: 't1', roles: ['user'] };
const fulfiller = { id: 'u-agent', tenant_id: 't1', roles: ['fulfiller'] };

let baseUrl = '';
let server: ReturnType<express.Express['listen']>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/attachments', router);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/attachments`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  state.visibleIncidents = new Set();
  state.articleStatus = null;
  state.attachment = null;
  state.queries = [];
  fakeClient.query.mockClear();
});

function as(user: object, path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), 'x-test-user': JSON.stringify(user) },
  });
}

function upload(user: object, entityType: string, entityId: string) {
  const form = new FormData();
  form.set('entity_type', entityType);
  form.set('entity_id', entityId);
  form.set('file', new Blob(['hello'], { type: 'text/plain' }), 'note.txt');
  return as(user, '/upload', { method: 'POST', body: form });
}

describe('attachments object-level access', () => {
  it('hides attachments of an incident the user cannot see', async () => {
    const res = await as(essUser, `/?entity_type=incident&entity_id=${INCIDENT_ID}`);

    expect(res.status).toBe(404);
    expect(state.queries.some((q) => q.includes('FROM attachments a'))).toBe(false);
  });

  it('lists attachments of a visible incident', async () => {
    state.visibleIncidents.add(INCIDENT_ID);

    const res = await as(essUser, `/?entity_type=incident&entity_id=${INCIDENT_ID}`);

    expect(res.status).toBe(200);
  });

  it('refuses uploads to an incident the user cannot see, before inserting', async () => {
    const res = await upload(essUser, 'incident', INCIDENT_ID);

    expect(res.status).toBe(404);
    expect(state.queries.some((q) => q.includes('INSERT INTO attachments'))).toBe(false);
  });

  it('refuses uploads for unsupported entity types', async () => {
    const res = await upload(fulfiller, 'payroll', INCIDENT_ID);

    expect(res.status).toBe(400);
  });

  it('blocks downloads of draft knowledge article files for non-authors', async () => {
    state.articleStatus = 'draft';
    state.attachment = {
      id: ATTACHMENT_ID, entity_type: 'knowledge_article', entity_id: ARTICLE_ID,
      storage_key: 'knowledge_article/x.png', file_name: 'x.png', mime_type: 'image/png', size_bytes: 1,
      uploaded_by: 'someone',
    };

    const res = await as(essUser, `/${ATTACHMENT_ID}/download`);

    expect(res.status).toBe(404);
  });

  it('lets only the uploader or staff delete an attachment', async () => {
    state.visibleIncidents.add(INCIDENT_ID);
    state.attachment = {
      id: ATTACHMENT_ID, entity_type: 'incident', entity_id: INCIDENT_ID,
      storage_key: 'incident/x.txt', file_name: 'x.txt', mime_type: 'text/plain', size_bytes: 1,
      uploaded_by: 'someone-else',
    };

    const denied = await as(essUser, `/${ATTACHMENT_ID}`, { method: 'DELETE' });
    expect(denied.status).toBe(403);
    expect(state.queries.some((q) => q.startsWith('DELETE FROM attachments'))).toBe(false);

    const allowed = await as(fulfiller, `/${ATTACHMENT_ID}`, { method: 'DELETE' });
    expect(allowed.status).toBe(200);
  });
});
