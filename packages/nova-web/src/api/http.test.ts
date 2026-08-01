/* SPDX-License-Identifier: AGPL-3.0-only */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { request, setToken } from './http';

describe('api/http', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses validation error details from failed responses', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'Validation failed',
        details: [{ path: 'email', message: 'Invalid email' }],
      }),
    } as Response);

    await expect(request('/auth/login', { method: 'POST', body: '{}' })).rejects.toThrow(
      'Validation failed (email: Invalid email)',
    );
  });

  it('clears token and redirects on 401 when a token was present', async () => {
    setToken('expired-token');
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    } as Response);

    const originalHref = window.location.href;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/incidents', href: originalHref },
    });

    await expect(request('/incidents')).rejects.toThrow('Unauthorized');
    expect(localStorage.getItem('nova_token')).toBeNull();
  });

  it('returns undefined for 204 responses', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
    } as Response);

    await expect(request('/reports/definitions/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
