/* SPDX-License-Identifier: AGPL-3.0-only */
import { fetchPublicHttp } from '../../../node/public-http-url';

export type ServiceNowAuth =
  | { kind: 'basic'; username: string; password: string }
  | { kind: 'oauth2'; tokenUrl: string; clientId: string; clientSecret: string; scope?: string }
  | { kind: 'api_key'; apiKey: string }
  | { kind: 'bearer'; token: string };

export type ServiceNowFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface ServiceNowClientOptions {
  instanceUrl: string;
  auth: ServiceNowAuth;
  fetchImpl?: ServiceNowFetch;
  pageSize?: number;
  maxRetries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class ServiceNowApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly table: string | null,
  ) {
    super(message);
    this.name = 'ServiceNowApiError';
  }
}

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end--;
  return value.slice(0, end);
}

/** Accepts "acme", "acme.service-now.com", or a full https URL. */
export function normalizeServiceNowInstanceUrl(raw: string): string {
  const trimmed = stripTrailingSlashes(raw.trim());
  if (!trimmed) throw new Error('Instance URL is required');
  if (/^[a-z0-9-]+$/i.test(trimmed)) return `https://${trimmed.toLowerCase()}.service-now.com`;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProto);
  if (url.protocol !== 'https:') throw new Error('Instance URL must use https');
  if (url.username || url.password) throw new Error('Instance URL must not include credentials');
  return `https://${url.host.toLowerCase()}`;
}

/**
 * Parses a tenant_credentials secret. Supported shapes:
 * - `user:password`
 * - `{"username","password"}` (optionally `auth_type: "basic"`)
 * - `{"auth_type":"oauth2_client_credentials","client_id","client_secret","token_url"?,"scope"?}`
 * - `{"auth_type":"api_key","api_key"}` (sent as x-sn-apikey)
 * - `{"auth_type":"bearer","token"}`
 */
export function parseServiceNowCredentialSecret(secret: string, instanceUrl: string): ServiceNowAuth {
  const raw = secret.trim();
  let parsed: unknown = null;
  if (raw.startsWith('{')) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('ServiceNow credential secret is not valid JSON');
    }
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    const authType = String(o.auth_type ?? o.type ?? '').toLowerCase();
    const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
    if (authType === 'oauth2_client_credentials' || authType === 'oauth2') {
      if (!s('client_id') || !s('client_secret')) throw new Error('OAuth2 credential requires client_id and client_secret');
      return {
        kind: 'oauth2',
        tokenUrl: s('token_url') || `${instanceUrl}/oauth_token.do`,
        clientId: s('client_id'),
        clientSecret: s('client_secret'),
        scope: s('scope') || undefined,
      };
    }
    if (authType === 'api_key') {
      if (!s('api_key')) throw new Error('API key credential requires api_key');
      return { kind: 'api_key', apiKey: s('api_key') };
    }
    if (authType === 'bearer') {
      if (!s('token')) throw new Error('Bearer credential requires token');
      return { kind: 'bearer', token: s('token') };
    }
    if (s('username') && s('password')) return { kind: 'basic', username: s('username'), password: s('password') };
    throw new Error('Unsupported ServiceNow credential JSON (expected basic, oauth2_client_credentials, api_key, or bearer)');
  }
  const idx = raw.indexOf(':');
  if (idx > 0) return { kind: 'basic', username: raw.slice(0, idx), password: raw.slice(idx + 1) };
  throw new Error('Unsupported ServiceNow credential secret (use "user:password" or a JSON object)');
}

export type TableListOptions = {
  query?: string;
  fields?: string;
  /** Stop after this many records (default: all). */
  limit?: number;
};

export class ServiceNowClient {
  readonly instanceUrl: string;
  private readonly auth: ServiceNowAuth;
  private readonly fetchImpl: ServiceNowFetch;
  private readonly pageSize: number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private oauthToken: { token: string; expiresAt: number } | null = null;
  requestCount = 0;

  constructor(opts: ServiceNowClientOptions) {
    this.instanceUrl = normalizeServiceNowInstanceUrl(opts.instanceUrl);
    this.auth = opts.auth;
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => fetchPublicHttp(url, init));
    this.pageSize = Math.max(1, Math.min(opts.pageSize ?? 1000, 10_000));
    this.maxRetries = Math.max(0, opts.maxRetries ?? 4);
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async authHeaders(): Promise<Record<string, string>> {
    switch (this.auth.kind) {
      case 'basic':
        return {
          Authorization: `Basic ${Buffer.from(`${this.auth.username}:${this.auth.password}`).toString('base64')}`,
        };
      case 'api_key':
        return { 'x-sn-apikey': this.auth.apiKey };
      case 'bearer':
        return { Authorization: `Bearer ${this.auth.token}` };
      case 'oauth2': {
        if (!this.oauthToken || this.oauthToken.expiresAt - 60_000 < Date.now()) {
          this.oauthToken = await this.fetchOAuthToken(this.auth);
        }
        return { Authorization: `Bearer ${this.oauthToken.token}` };
      }
    }
  }

  private async fetchOAuthToken(auth: Extract<ServiceNowAuth, { kind: 'oauth2' }>) {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: auth.clientId,
      client_secret: auth.clientSecret,
    });
    if (auth.scope) body.set('scope', auth.scope);
    const res = await this.fetchImpl(auth.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    });
    const text = await res.text();
    if (!res.ok) throw new ServiceNowApiError(`OAuth token request failed: ${res.status} ${text.slice(0, 200)}`, res.status, null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new ServiceNowApiError('OAuth token response is not JSON', res.status, null);
    }
    if (typeof parsed.access_token !== 'string') throw new ServiceNowApiError('OAuth token response has no access_token', res.status, null);
    const expiresIn = typeof parsed.expires_in === 'number' ? parsed.expires_in : 1800;
    return { token: parsed.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  }

  private async request(path: string, table: string | null): Promise<{ body: unknown; headers: Headers }> {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      this.requestCount += 1;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), this.timeoutMs);
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.instanceUrl}${path}`, {
          method: 'GET',
          headers: { Accept: 'application/json', ...(await this.authHeaders()) },
          signal: ac.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (attempt <= this.maxRetries) {
          await this.sleep(this.backoffMs(attempt, null));
          continue;
        }
        throw new ServiceNowApiError(
          `ServiceNow request failed: ${err instanceof Error ? err.message : String(err)}`,
          0,
          table,
        );
      }
      clearTimeout(timer);
      if ((res.status === 429 || res.status >= 500) && attempt <= this.maxRetries) {
        await res.text().catch(() => '');
        await this.sleep(this.backoffMs(attempt, res.headers.get('retry-after')));
        continue;
      }
      if (res.status === 401 && this.auth.kind === 'oauth2' && attempt === 1) {
        this.oauthToken = null;
        continue;
      }
      const text = await res.text();
      if (!res.ok) {
        let detail = text.slice(0, 300);
        try {
          const j = JSON.parse(text) as { error?: { message?: string; detail?: string } };
          detail = [j.error?.message, j.error?.detail].filter(Boolean).join(': ') || detail;
        } catch {
          // keep raw text
        }
        throw new ServiceNowApiError(`ServiceNow ${table ?? 'request'} returned ${res.status}: ${detail}`, res.status, table);
      }
      try {
        return { body: JSON.parse(text) as unknown, headers: res.headers };
      } catch {
        throw new ServiceNowApiError(`ServiceNow ${table ?? 'request'} returned non-JSON (is this a ServiceNow instance?)`, res.status, table);
      }
    }
  }

  private backoffMs(attempt: number, retryAfter: string | null): number {
    const ra = retryAfter ? Number.parseInt(retryAfter, 10) : NaN;
    if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, 60_000);
    return Math.min(500 * 2 ** (attempt - 1), 15_000);
  }

  private tablePath(table: string, params: Record<string, string>): string {
    if (!/^[a-z0-9_]+$/.test(table)) throw new Error(`Invalid table name: ${table}`);
    const qs = new URLSearchParams({
      sysparm_display_value: 'false',
      sysparm_exclude_reference_link: 'true',
      ...params,
    });
    return `/api/now/table/${table}?${qs.toString()}`;
  }

  async list(table: string, opts: TableListOptions = {}): Promise<Array<Record<string, unknown>>> {
    const out: Array<Record<string, unknown>> = [];
    const max = opts.limit ?? Number.POSITIVE_INFINITY;
    let offset = 0;
    for (;;) {
      const pageLimit = Math.min(this.pageSize, max - out.length);
      if (pageLimit <= 0) break;
      const params: Record<string, string> = {
        sysparm_limit: String(pageLimit),
        sysparm_offset: String(offset),
      };
      if (opts.query) params.sysparm_query = opts.query;
      if (opts.fields) params.sysparm_fields = opts.fields;
      const { body } = await this.request(this.tablePath(table, params), table);
      const result = (body as { result?: unknown }).result;
      const rows = Array.isArray(result) ? (result as Array<Record<string, unknown>>) : [];
      out.push(...rows);
      if (rows.length < pageLimit) break;
      offset += rows.length;
    }
    return out;
  }

  /** Runs `field IN (ids)` queries in chunks to keep URLs short. */
  async listIn(
    table: string,
    field: string,
    ids: string[],
    opts: { extraQuery?: string; fields?: string; chunkSize?: number } = {},
  ): Promise<Array<Record<string, unknown>>> {
    const unique = [...new Set(ids.filter(Boolean))];
    const chunkSize = opts.chunkSize ?? 100;
    const out: Array<Record<string, unknown>> = [];
    for (let i = 0; i < unique.length; i += chunkSize) {
      const chunk = unique.slice(i, i + chunkSize);
      const query = [`${field}IN${chunk.join(',')}`, opts.extraQuery].filter(Boolean).join('^');
      out.push(...(await this.list(table, { query, fields: opts.fields })));
    }
    return out;
  }

  /** Returns HTTP status and total row count without throwing on 401/403/404. */
  async probe(table: string, query?: string): Promise<{ ok: boolean; status: number; total: number | null; error?: string }> {
    try {
      const params: Record<string, string> = { sysparm_limit: '1', sysparm_fields: 'sys_id' };
      if (query) params.sysparm_query = query;
      const { headers } = await this.request(this.tablePath(table, params), table);
      const total = headers.get('x-total-count');
      return { ok: true, status: 200, total: total ? Number.parseInt(total, 10) : null };
    } catch (err) {
      if (err instanceof ServiceNowApiError) return { ok: false, status: err.status, total: null, error: err.message };
      throw err;
    }
  }
}
