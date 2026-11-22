/* SPDX-License-Identifier: AGPL-3.0-only */
import type { AddressInfo, Server } from 'node:net';
import express from 'express';
import apiRouter from '../api/routes';
import { errorHandler } from '../middleware/errorHandler';
import { requireSameOrigin } from '../middleware/csrf';

export type TestApp = {
  baseUrl: string;
  close: () => Promise<void>;
};

/** Minimal HTTP stack for API flow tests (real routers + DB, no Temporal schedules). */
export async function startTestApp(): Promise<TestApp> {
  const app = express();
  app.set('trust proxy', 0);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', requireSameOrigin);
  app.use('/api', apiRouter);
  app.use(errorHandler);

  const server: Server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1');
    s.once('listening', () => resolve(s));
    s.once('error', reject);
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}

export async function login(
  baseUrl: string,
  email: string,
  password: string,
): Promise<{ token: string; user: { id: string; roles: string[] } }> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json() as {
    token?: string;
    user?: { id: string; roles: string[] };
    error?: string;
  };
  if (!res.ok || !body.token || !body.user) {
    throw new Error(`login failed (${res.status}): ${body.error ?? JSON.stringify(body)}`);
  }
  return { token: body.token, user: body.user };
}

export function apiHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}
