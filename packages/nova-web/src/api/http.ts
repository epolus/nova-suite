/* SPDX-License-Identifier: AGPL-3.0-only */
export const BASE = '/api';

export function getToken(): string | null {
  return localStorage.getItem('nova_token');
}

export function setToken(token: string) {
  localStorage.setItem('nova_token', token);
}

export function clearToken() {
  localStorage.removeItem('nova_token');
}

function parseErrorBody(body: { error?: string; details?: Array<{ path?: string; message?: string }> }, status: number): string {
  const details = Array.isArray(body?.details)
    ? body.details
        .map((detail) => {
          const p = typeof detail?.path === 'string' && detail.path ? `${detail.path}: ` : '';
          const message = typeof detail?.message === 'string' ? detail.message : 'Invalid value';
          return `${p}${message}`;
        })
        .filter(Boolean)
    : [];
  const baseMessage =
    typeof body?.error === 'string' && body.error.trim().length > 0 ? body.error : `Request failed: ${status}`;
  return details.length > 0 ? `${baseMessage} (${details.join('; ')})` : baseMessage;
}

export async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });

  if (res.status === 401) {
    if (token) {
      clearToken();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(parseErrorBody(body, res.status));
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export async function uploadFile<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: formData });

  if (res.status === 401) {
    if (token) {
      clearToken();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(parseErrorBody(body, res.status));
  }
  return res.json();
}
