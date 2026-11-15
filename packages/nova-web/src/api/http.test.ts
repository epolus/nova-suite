/* SPDX-License-Identifier: AGPL-3.0-only */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dropLegacyToken, request, setSessionUser, setUnauthorizedHandler, getSessionUserId } from './http';

function respond(status: number, body: unknown = {}) {
  vi.mocked(fetch).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: async () => body,
  } as Response);
}

describe('api/http', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
    setSessionUser('u1');
  });

  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.unstubAllGlobals();
  });

  it('parses validation error details from failed responses', async () => {
    respond(400, { error: 'Validation failed', details: [{ path: 'email', message: 'Invalid email' }] });
    await expect(request('/auth/login', { method: 'POST', body: '{}' })).rejects.toThrow(
      'Validation failed (email: Invalid email)',
    );
  });

  it('sends same-origin credentials and no Authorization header', async () => {
    respond(200, { ok: true });
    await request('/incidents');
    const init = vi.mocked(fetch).mock.calls[0]![1]!;
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('notifies the unauthorized handler once per session on 401', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    respond(401, { error: 'Unauthorized' });

    await expect(request('/incidents')).rejects.toThrow('Unauthorized');
    await expect(request('/changes')).rejects.toThrow('Unauthorized');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(getSessionUserId()).toBeNull();

    setSessionUser('u1');
    await expect(request('/incidents')).rejects.toThrow('Unauthorized');
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('does not treat a 401 from the session probe as a lost session', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    respond(401);
    await expect(request('/auth/me')).rejects.toThrow('Unauthorized');
    expect(handler).not.toHaveBeenCalled();
  });

  it('removes the legacy localStorage token', () => {
    localStorage.setItem('nova_token', 'old');
    dropLegacyToken();
    expect(localStorage.getItem('nova_token')).toBeNull();
  });

  it('returns undefined for 204 responses', async () => {
    respond(204);
    await expect(request('/reports/definitions/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
