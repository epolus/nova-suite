/* SPDX-License-Identifier: AGPL-3.0-only */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_CHANGE_GROUP, SEED_CHANGE_TYPE_NORMAL, SEED_INCIDENT_GROUP } from './pg';
import { apiHeaders, login, startTestApp, type TestApp } from './http-app';

const ADMIN_EMAIL = 'admin@acme.local';
const ADMIN_PASSWORD = 'admin123';

describe('API flows (integration)', () => {
  let app: TestApp;
  let token: string;

  beforeAll(async () => {
    app = await startTestApp();
    ({ token } = await login(app.baseUrl, ADMIN_EMAIL, ADMIN_PASSWORD));
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  describe('incidents', () => {
    it('creates an incident and reads it back', async () => {
      const create = await fetch(`${app.baseUrl}/api/incidents`, {
        method: 'POST',
        headers: apiHeaders(token),
        body: JSON.stringify({
          title: 'CI flow incident',
          description: 'Created by API flow integration test',
          impact: 'low',
          urgency: 'low',
          assignment_group_id: SEED_INCIDENT_GROUP,
        }),
      });
      const created = await create.json() as {
        id?: string;
        number?: string;
        title?: string;
        status?: string;
        error?: string;
        details?: unknown;
      };
      expect(create.status, JSON.stringify(created)).toBe(201);
      expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(created.number).toMatch(/^INC/i);
      expect(created.title).toBe('CI flow incident');
      expect(created.status).toBe('new');

      const get = await fetch(`${app.baseUrl}/api/incidents/${created.id}`, {
        headers: apiHeaders(token),
      });
      expect(get.status).toBe(200);
      const fetched = await get.json() as { id: string; title: string };
      expect(fetched.id).toBe(created.id);
      expect(fetched.title).toBe('CI flow incident');
    });
  });

  describe('catalog', () => {
    it('lists active catalog items and fetches one by id', async () => {
      const list = await fetch(`${app.baseUrl}/api/catalog/items`, {
        headers: apiHeaders(token),
      });
      expect(list.status).toBe(200);
      const body = await list.json() as { items: Array<{ id: string; name: string; is_active: boolean }> };
      expect(body.items.length).toBeGreaterThan(0);
      const first = body.items[0]!;

      const detail = await fetch(`${app.baseUrl}/api/catalog/items/${first.id}`, {
        headers: apiHeaders(token),
      });
      expect(detail.status).toBe(200);
      const item = await detail.json() as { id: string; name: string };
      expect(item.id).toBe(first.id);
      expect(item.name).toBe(first.name);
    });

    it('lists catalog categories', async () => {
      const res = await fetch(`${app.baseUrl}/api/catalog/categories`, {
        headers: apiHeaders(token),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as { categories?: unknown[] } | unknown[];
      const categories = Array.isArray(body) ? body : body.categories;
      expect(Array.isArray(categories)).toBe(true);
      expect((categories as unknown[]).length).toBeGreaterThan(0);
    });
  });

  describe('changes', () => {
    it('creates a change and reads it back', async () => {
      const create = await fetch(`${app.baseUrl}/api/changes`, {
        method: 'POST',
        headers: apiHeaders(token),
        body: JSON.stringify({
          change_type_id: SEED_CHANGE_TYPE_NORMAL,
          assignment_group_id: SEED_CHANGE_GROUP,
          title: 'CI flow change',
          description: 'Created by API flow integration test',
          reason_for_change: 'Verify change create path',
          impact: 'low',
          priority: 'low',
          risk_level: 'low',
        }),
      });
      expect(create.status).toBe(201);
      const created = await create.json() as {
        id: string;
        number: string;
        title: string;
        status: string;
      };
      expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(created.number).toMatch(/^CHG/i);
      expect(created.title).toBe('CI flow change');
      expect(created.status).toBeTruthy();

      const get = await fetch(`${app.baseUrl}/api/changes/${created.id}`, {
        headers: apiHeaders(token),
      });
      expect(get.status).toBe(200);
      const fetched = await get.json() as { id: string; title: string };
      expect(fetched.id).toBe(created.id);
      expect(fetched.title).toBe('CI flow change');
    });
  });
});
