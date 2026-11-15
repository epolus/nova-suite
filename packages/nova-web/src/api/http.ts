/* SPDX-License-Identifier: AGPL-3.0-only */
// All API traffic goes through this module. The session lives in an httpOnly
// cookie set by the API, so nothing here can read or leak the access token.
export const BASE = '/api';

const LEGACY_TOKEN_KEY = 'nova_token';
// Endpoints whose 401 is an expected answer for the caller, not a dead session.
const AUTH_PROBE_PATHS = new Set(['/auth/me', '/auth/login', '/auth/logout', '/auth/sso/exchange']);

let sessionUserId: string | null = null;
let unauthorizedHandler: (() => void) | null = null;
let unauthorizedNotified = false;

/** Older builds kept a bearer token in localStorage; remove it so it cannot be read by injected scripts. */
export function dropLegacyToken(): void {
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    // storage unavailable
  }
}

/** Set by AuthProvider; lets providers outside the auth context know whether a user is signed in. */
export function setSessionUser(userId: string | null): void {
  sessionUserId = userId;
  if (userId) unauthorizedNotified = false;
}

export function getSessionUserId(): string | null {
  return sessionUserId;
}

/** Called once when an API call reports the session is gone (until the next sign-in). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function notifyUnauthorized(path: string): void {
  if (AUTH_PROBE_PATHS.has(path) || unauthorizedNotified) return;
  unauthorizedNotified = true;
  sessionUserId = null;
  if (unauthorizedHandler) {
    unauthorizedHandler();
  } else if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

function parseErrorBody(body: { error?: string; details?: Array<{ path?: string; message?: string }> | string[] }, status: number): string {
  const rawDetails = body?.details;
  const details = Array.isArray(rawDetails)
    ? rawDetails
        .map((detail) => {
          if (typeof detail === 'string') return detail;
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

async function errorFromResponse(res: Response): Promise<Error> {
  const body = await res.json().catch(() => ({ error: res.statusText }));
  return new Error(parseErrorBody(body, res.status));
}

/** Raw fetch against the API with session handling; use for streams and binary bodies. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, { ...init, credentials: 'same-origin' });
  if (res.status === 401) {
    notifyUnauthorized(path);
    throw new Error('Unauthorized');
  }
  return res;
}

export async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((opts.headers as Record<string, string>) || {}),
  };
  const res = await apiFetch(path, { ...opts, headers });
  if (!res.ok) throw await errorFromResponse(res);
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export async function uploadFile<T>(path: string, formData: FormData): Promise<T> {
  const res = await apiFetch(path, { method: 'POST', body: formData });
  if (!res.ok) throw await errorFromResponse(res);
  return res.json();
}

export async function requestBlob(path: string): Promise<Blob> {
  const res = await apiFetch(path);
  if (!res.ok) throw await errorFromResponse(res);
  return res.blob();
}
