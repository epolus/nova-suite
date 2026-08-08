/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  type AdvancedCondition,
  type AutomationActivityState,
  type AutomationBranch,
  type AutomationCiCreateActionState,
  type AutomationCiLookupActionState,
  type AutomationConfig,
  type AutomationRestActionState,
  type AutomationState,
  type AutomationTransition,
} from './automation-config';
import {
  executeNativeLibraryState,
  type AutomationSendEmail,
} from './automation-native';

const MAX_EXECUTION_STEPS = 120;
const OAUTH_TOKEN_SAFETY_MS = 60_000;

export type CredentialTemplateValue = string | Record<string, unknown>;

type OAuthTokenCacheEntry = { accessToken: string; expiresAtMs: number };
const oauthTokenCache = new Map<string, OAuthTokenCacheEntry>();

interface OAuth2ClientCredentialsSecret {
  type?: string;
  auth_type?: string;
  token_url?: string;
  client_id?: string;
  client_secret?: string;
  scope?: string;
  audience?: string;
  grant_type?: string;
}

export type ExecuteAutomationGraphParams = {
  cfg: AutomationConfig;
  request: Record<string, unknown>;
  credMap: Record<string, CredentialTemplateValue>;
  /** When set with client and persistFormData true, merges form_data patch into requests */
  requestId?: string;
  client?: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };
  persistFormData?: boolean; // default true when client+requestId present, false for dry-run
  maxDelayMs?: number; // cap each delay step (dry-run can pass 2000)
  automationSharedKey?: string; // for X-Automation-Key; fall back to process.env.CATALOG_AUTOMATION_SHARED_KEY
  onLog?: (msg: string, meta?: object) => void;
  dryRun?: boolean;
  tenantId?: string;
  requestTaskId?: string;
  callDepth?: number;
  sendEmail?: AutomationSendEmail;
};

export type ExecuteAutomationGraphResult = {
  ok: boolean;
  message: string;
  rejectRequest: boolean;
  skipTaskOrders: number[];
  notes: Record<string, unknown>;
  trace: string[];
  mergePatch: Record<string, unknown>;
  stateResults: Record<string, unknown>;
  warnings: string[];
};

function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function buildTemplateContext(params: {
  request: Record<string, unknown>;
  response?: { status: number; bodyText: string; bodyJson: unknown };
  cred?: Record<string, CredentialTemplateValue>;
  state?: Record<string, unknown>;
}): Record<string, unknown> {
  const { request, response, cred, state } = params;
  const formData = (request.form_data as Record<string, unknown>) || {};
  const deliveryInfo = (request.delivery_info as Record<string, unknown>) || {};
  return {
    request: {
      id: request.id,
      number: request.number,
      status: request.status,
      form_data: formData,
      delivery_info: deliveryInfo,
      requester_id: request.requester_id,
      requested_for: request.requested_for,
      assigned_to: request.assigned_to,
    },
    response: response
      ? {
          status: response.status,
          body: response.bodyJson !== undefined ? response.bodyJson : response.bodyText,
          text: response.bodyText,
        }
      : {},
    cred: cred ?? {},
    state: state ?? {},
  };
}

function interpolateString(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey: string) => {
    const key = rawKey.trim();
    const envMatch = /^env\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(key);
    if (envMatch) {
      const v = process.env[envMatch[1]];
      return v !== undefined ? v : '';
    }
    const v = getByPath(ctx, key.replace(/\[(\w+)\]/g, '.$1'));
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  });
}

function interpolateRecord(
  rec: Record<string, string> | undefined,
  ctx: Record<string, unknown>,
): Record<string, string> | undefined {
  if (!rec) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    out[k] = interpolateString(v, ctx);
  }
  return out;
}

function collectCredSlugsFromText(raw: string, out: Set<string>): void {
  const re = /\{\{\s*cred\.([A-Za-z0-9_]+)(?:\.[^}\s]+)?\s*\}\}/g;
  let m;
  while ((m = re.exec(raw)) !== null) out.add(m[1]);
}

function parseOAuth2CredentialSecret(raw: string): OAuth2ClientCredentialsSecret | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  const authType = String(obj.auth_type ?? obj.type ?? '').trim().toLowerCase();
  if (authType !== 'oauth2_client_credentials' && authType !== 'oauth2') return null;
  return {
    type: typeof obj.type === 'string' ? obj.type : undefined,
    auth_type: typeof obj.auth_type === 'string' ? obj.auth_type : undefined,
    token_url: typeof obj.token_url === 'string' ? obj.token_url : undefined,
    client_id: typeof obj.client_id === 'string' ? obj.client_id : undefined,
    client_secret: typeof obj.client_secret === 'string' ? obj.client_secret : undefined,
    scope: typeof obj.scope === 'string' ? obj.scope : undefined,
    audience: typeof obj.audience === 'string' ? obj.audience : undefined,
    grant_type: typeof obj.grant_type === 'string' ? obj.grant_type : undefined,
  };
}

function oauthCacheKey(tenantId: string, slug: string, oauth: OAuth2ClientCredentialsSecret): string {
  return [
    tenantId,
    slug,
    oauth.token_url || '',
    oauth.client_id || '',
    oauth.scope || '',
    oauth.audience || '',
  ].join('|');
}

async function fetchOAuth2AccessToken(
  tenantId: string,
  slug: string,
  oauth: OAuth2ClientCredentialsSecret,
  onLog?: (msg: string, meta?: object) => void,
): Promise<{ accessToken: string; expiresInSec: number }> {
  if (!oauth.token_url || !oauth.client_id || !oauth.client_secret) {
    throw new Error(
      `Credential "${slug}" OAuth2 config is incomplete (token_url, client_id, client_secret required).`,
    );
  }
  const grantType = oauth.grant_type?.trim() || 'client_credentials';
  const body = new URLSearchParams({
    grant_type: grantType,
    client_id: oauth.client_id,
    client_secret: oauth.client_secret,
  });
  if (oauth.scope) body.set('scope', oauth.scope);
  if (oauth.audience) body.set('audience', oauth.audience);
  const res = await fetch(oauth.token_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth2 token request failed for "${slug}": ${res.status} ${text.slice(0, 300)}`);
  }
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`OAuth2 token response for "${slug}" is not valid JSON.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`OAuth2 token response for "${slug}" has invalid shape.`);
  }
  const token = (parsed as Record<string, unknown>).access_token;
  const expiresIn = (parsed as Record<string, unknown>).expires_in;
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error(`OAuth2 token response for "${slug}" is missing access_token.`);
  }
  const expiresInSec =
    typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0
      ? Math.floor(expiresIn)
      : 300;
  onLog?.('Obtained OAuth2 access token for automation credential', { tenantId, slug, expiresInSec });
  return { accessToken: token, expiresInSec };
}

async function getOAuth2AccessTokenCached(
  tenantId: string,
  slug: string,
  oauth: OAuth2ClientCredentialsSecret,
  onLog?: (msg: string, meta?: object) => void,
): Promise<string> {
  const now = Date.now();
  const key = oauthCacheKey(tenantId, slug, oauth);
  const existing = oauthTokenCache.get(key);
  if (existing && existing.expiresAtMs - OAUTH_TOKEN_SAFETY_MS > now) {
    return existing.accessToken;
  }
  const fresh = await fetchOAuth2AccessToken(tenantId, slug, oauth, onLog);
  oauthTokenCache.set(key, {
    accessToken: fresh.accessToken,
    expiresAtMs: now + fresh.expiresInSec * 1000,
  });
  return fresh.accessToken;
}

export async function resolveCredentialTemplateValues(
  tenantId: string,
  rawCredMap: Record<string, string>,
  onLog?: (msg: string, meta?: object) => void,
): Promise<Record<string, CredentialTemplateValue>> {
  const out: Record<string, CredentialTemplateValue> = {};
  for (const [slug, secret] of Object.entries(rawCredMap)) {
    const oauth = parseOAuth2CredentialSecret(secret);
    if (!oauth) {
      out[slug] = secret;
      continue;
    }
    const accessToken = await getOAuth2AccessTokenCached(tenantId, slug, oauth, onLog);
    out[slug] = {
      ...oauth,
      access_token: accessToken,
      token_type: 'Bearer',
    };
  }
  return out;
}

export function collectCredSlugsFromAutomation(cfg: AutomationConfig): string[] {
  const slugs = new Set<string>();
  for (const s of cfg.states) {
    if (s.type === 'activity' || s.type === 'action.rest' || s.type === 'action.ci.create' || s.type === 'action.ci.lookup') {
      collectCredSlugsFromText(s.url || '', slugs);
      if ('body' in s && s.body) collectCredSlugsFromText(s.body, slugs);
      for (const v of Object.values(s.headers || {})) collectCredSlugsFromText(v, slugs);
      for (const b of [s.onSuccess, s.onFailure]) {
        for (const v of Object.values(b?.mergeFormData || {})) collectCredSlugsFromText(v, slugs);
      }
    }
    if (s.type === 'decision') collectCredSlugsFromText(s.condition, slugs);
    if (s.type === 'action.notification') {
      collectCredSlugsFromText(s.titleTemplate || '', slugs);
      collectCredSlugsFromText(s.bodyTemplate || '', slugs);
      collectCredSlugsFromText(s.recipientType || '', slugs);
    }
    if (s.type === 'action.ticket' && s.fields) {
      collectCredSlugsFromText(JSON.stringify(s.fields), slugs);
    }
    if (s.type === 'action.assign') {
      collectCredSlugsFromText(s.assigneeTemplate || '', slugs);
      collectCredSlugsFromText(s.groupIdTemplate || '', slugs);
    }
    if (s.type === 'action.script') collectCredSlugsFromText(s.code || '', slugs);
    if (s.type === 'call.workflow') {
      collectCredSlugsFromText(s.workflowType || '', slugs);
      collectCredSlugsFromText(s.definitionId || '', slugs);
      if (s.input) collectCredSlugsFromText(JSON.stringify(s.input), slugs);
    }
    if (s.type === 'end') {
      for (const b of [s.onSuccess, s.onFailure]) {
        for (const v of Object.values(b?.mergeFormData || {})) collectCredSlugsFromText(v, slugs);
      }
    }
  }
  return [...slugs];
}

async function runHttpStep(
  state: AutomationActivityState,
  ctxBeforeRequest: Record<string, unknown>,
  automationSharedKey?: string,
): Promise<{ ok: boolean; status: number; bodyText: string; bodyJson: unknown }> {
  const method = (state.method || 'GET').toUpperCase();
  const url = interpolateString(state.url, ctxBeforeRequest);
  const headers = interpolateRecord(state.headers, ctxBeforeRequest) || {};
  const body =
    state.body === undefined || state.body === null
      ? undefined
      : interpolateString(state.body, ctxBeforeRequest);
  const timeoutMs = Math.min(Math.max((state.timeoutSeconds ?? 30) * 1000, 1000), 120_000);
  const automationKey = (automationSharedKey ?? process.env.CATALOG_AUTOMATION_SHARED_KEY)?.trim();
  let injectAutomationKey = false;
  try {
    const parsedUrl = new URL(url);
    injectAutomationKey = parsedUrl.pathname.startsWith('/api/catalog/automation/');
  } catch {
    injectAutomationKey = false;
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...headers,
        ...(injectAutomationKey && automationKey ? { 'X-Automation-Key': automationKey } : {}),
        ...(body !== undefined && !headers['Content-Type'] ? { 'Content-Type': 'application/json' } : {}),
      },
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
      signal: ac.signal,
    });
    const bodyText = await res.text();
    let bodyJson: unknown = undefined;
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = undefined;
    }
    return { ok: res.status >= 200 && res.status < 300, status: res.status, bodyText, bodyJson };
  } finally {
    clearTimeout(timer);
  }
}

function interpolateUnknown(input: unknown, ctx: Record<string, unknown>): unknown {
  if (typeof input === 'string') return interpolateString(input, ctx);
  if (Array.isArray(input)) return input.map((v) => interpolateUnknown(v, ctx));
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) out[k] = interpolateUnknown(v, ctx);
    return out;
  }
  return input;
}

export function toHttpActivityState(
  state: AutomationActivityState | AutomationRestActionState | AutomationCiCreateActionState | AutomationCiLookupActionState,
  ctxBeforeRequest: Record<string, unknown>,
): AutomationActivityState {
  if (state.type === 'action.ci.create') {
    const payload = {
      request_id: getByPath(ctxBeforeRequest, 'request.id'),
      class_name: interpolateString(state.className, ctxBeforeRequest),
      name: interpolateString(state.name, ctxBeforeRequest),
      display_name: state.displayName ? interpolateString(state.displayName, ctxBeforeRequest) : undefined,
      status: state.status ? interpolateString(state.status, ctxBeforeRequest) : undefined,
      environment: state.environment ? interpolateString(state.environment, ctxBeforeRequest) : undefined,
      attributes: interpolateUnknown(state.attributes || {}, ctxBeforeRequest),
    };
    return {
      ...state,
      type: 'activity',
      method: 'POST',
      body: JSON.stringify(payload),
    };
  }
  if (state.type === 'action.ci.lookup') {
    const payload = {
      request_id: getByPath(ctxBeforeRequest, 'request.id'),
      class_name: state.className ? interpolateString(state.className, ctxBeforeRequest) : undefined,
      attributes: interpolateUnknown(state.attributes || {}, ctxBeforeRequest),
      limit: state.limit ?? 10,
    };
    return {
      ...state,
      type: 'activity',
      method: 'POST',
      body: JSON.stringify(payload),
    };
  }
  return {
    ...state,
    type: 'activity',
  };
}

function selectTransition(
  transitions: AutomationTransition[] | undefined,
  when: string | null,
): string | null {
  const list = transitions || [];
  if (list.length === 0) return null;
  if (when !== null) {
    const match = list.find((t) => (t.when || '').toLowerCase() === when.toLowerCase());
    if (match) return match.to;
  }
  const unlabeled = list.find((t) => !t.when);
  if (unlabeled) return unlabeled.to;
  return list[0]?.to || null;
}

function applyBranchEffects(
  branch: AutomationBranch | undefined,
  ctx: Record<string, unknown>,
  mergePatch: Record<string, unknown>,
  skipOrders: Set<number>,
): { rejectRequest: boolean; nextStateId?: string } {
  if (!branch) return { rejectRequest: false };
  for (const [k, tmpl] of Object.entries(branch.mergeFormData || {})) {
    mergePatch[k] = interpolateString(tmpl, ctx);
  }
  for (const n of branch.skipTaskOrders || []) {
    if (Number.isFinite(n)) skipOrders.add(n);
  }
  return { rejectRequest: Boolean(branch.rejectRequest), nextStateId: branch.nextStateId };
}

function evaluateDecision(condition: string, ctx: Record<string, unknown>): boolean {
  const v = interpolateString(condition, ctx).trim().toLowerCase();
  return ['true', '1', 'yes', 'ok', 'approved', 'success'].includes(v);
}

function resolveOperand(input: unknown, ctx: Record<string, unknown>): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const obj = input as Record<string, unknown>;
  if (typeof obj.var === 'string') {
    return getByPath(ctx, obj.var.replace(/\[(\w+)\]/g, '.$1'));
  }
  return input;
}

function compareValues(op: string, leftRaw: unknown, rightRaw: unknown): boolean {
  const left = leftRaw as string | number | boolean | null | undefined;
  const right = rightRaw as string | number | boolean | null | undefined;
  if (op === 'eq') return left === right;
  if (op === 'ne') return left !== right;
  if (op === 'gt') return Number(left) > Number(right);
  if (op === 'gte') return Number(left) >= Number(right);
  if (op === 'lt') return Number(left) < Number(right);
  if (op === 'lte') return Number(left) <= Number(right);
  if (op === 'contains') {
    if (typeof left === 'string') return left.includes(String(right ?? ''));
    if (Array.isArray(leftRaw)) return (leftRaw as unknown[]).includes(rightRaw);
    return false;
  }
  if (op === 'in') {
    if (Array.isArray(rightRaw)) return (rightRaw as unknown[]).includes(leftRaw);
    return false;
  }
  return false;
}

export function evaluateAdvancedCondition(expr: AdvancedCondition, ctx: Record<string, unknown>): boolean {
  switch (expr.op) {
    case 'and':
      return expr.conditions.every((c) => evaluateAdvancedCondition(c, ctx));
    case 'or':
      return expr.conditions.some((c) => evaluateAdvancedCondition(c, ctx));
    case 'not':
      return !evaluateAdvancedCondition(expr.condition, ctx);
    case 'eq':
    case 'ne':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
    case 'contains':
    case 'in': {
      const left = resolveOperand(expr.left, ctx);
      const right = resolveOperand(expr.right, ctx);
      return compareValues(expr.op, left, right);
    }
    default:
      return false;
  }
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeAutomationGraph(
  params: ExecuteAutomationGraphParams,
): Promise<ExecuteAutomationGraphResult> {
  const {
    cfg,
    request,
    credMap,
    requestId,
    client,
    maxDelayMs,
    automationSharedKey,
    requestTaskId,
    sendEmail,
  } = params;
  const callDepth = params.callDepth ?? 0;
  const persistFormData =
    params.persistFormData ?? Boolean(client && requestId);
  const skipOrders = new Set<number>();
  const mergePatch: Record<string, unknown> = {};
  const trace: string[] = [];
  const stateResults: Record<string, unknown> = {};
  const warnings: string[] = [];
  const byId = new Map(cfg.states.map((s) => [s.id, s]));

  let step = 0;
  let current: string | null = cfg.startAt;
  let lastResponse: { status: number; bodyText: string; bodyJson: unknown } | undefined;
  let terminal: { ok: boolean; message: string; rejectRequest: boolean } | null = null;

  while (step < MAX_EXECUTION_STEPS && current) {
    step += 1;
    const state = byId.get(current);
    if (!state) {
      terminal = { ok: false, message: `Unknown state id: ${current}`, rejectRequest: false };
      break;
    }
    trace.push(`${step}:${state.id}:${state.type}`);

    if (state.type === 'end') {
      const endOk = state.result !== 'failure';
      const ctx = buildTemplateContext({ request, response: lastResponse, cred: credMap, state: stateResults });
      const branch = endOk ? state.onSuccess : state.onFailure;
      const fx = applyBranchEffects(branch, ctx, mergePatch, skipOrders);
      terminal = {
        ok: endOk,
        message: endOk ? 'Reached end state (success)' : 'Reached end state (failure)',
        rejectRequest: fx.rejectRequest,
      };
      break;
    }

    if (state.type === 'delay') {
      const delaySec = Math.max(1, Math.min(Number(state.delaySeconds || 1), 3600));
      let delayMs = delaySec * 1000;
      if (maxDelayMs !== undefined && delayMs > maxDelayMs) {
        warnings.push(`Delay state ${state.id} capped from ${delaySec}s to ${maxDelayMs}ms`);
        delayMs = maxDelayMs;
      }
      await sleepMs(delayMs);
      current = selectTransition(state.transitions, null);
      if (!current) {
        terminal = { ok: true, message: `Delay state ${state.id} has no next transition`, rejectRequest: false };
        break;
      }
      continue;
    }

    if (state.type === 'decision') {
      const ctx = buildTemplateContext({ request, response: lastResponse, cred: credMap, state: stateResults });
      const branchBool = evaluateDecision(state.condition, ctx);
      const when = branchBool ? 'true' : 'false';
      stateResults[state.id] = { result: branchBool };
      mergePatch[`automation_${state.id}_result`] = branchBool;
      mergePatch[`automation_${state.id}_when`] = when;
      current = selectTransition(state.transitions, when);
      if (!current) {
        terminal = { ok: false, message: `Decision state ${state.id} has no ${when} transition`, rejectRequest: false };
        break;
      }
      continue;
    }

    if (state.type === 'decision.advanced') {
      const ctx = buildTemplateContext({ request, response: lastResponse, cred: credMap, state: stateResults });
      const branchBool = evaluateAdvancedCondition(state.expression, ctx);
      const when = branchBool ? 'true' : 'false';
      stateResults[state.id] = { result: branchBool };
      mergePatch[`automation_${state.id}_result`] = branchBool;
      mergePatch[`automation_${state.id}_when`] = when;
      current = selectTransition(state.transitions, when);
      if (!current) {
        terminal = { ok: false, message: `Decision state ${state.id} has no ${when} transition`, rejectRequest: false };
        break;
      }
      continue;
    }

    if (
      state.type === 'action.notification' ||
      state.type === 'action.ticket' ||
      state.type === 'action.assign' ||
      state.type === 'action.script' ||
      state.type === 'call.workflow'
    ) {
      const ctx = buildTemplateContext({ request, response: lastResponse, cred: credMap, state: stateResults });
      let native = {
        ok: false,
        message: `Unsupported action state type: ${state.type}`,
        result: undefined as unknown,
      };
      try {
        const executed = await executeNativeLibraryState({
          state,
          ctx,
          request,
          client,
          requestId,
          requestTaskId,
          sendEmail,
          callDepth,
          runSubgraph: async (nestedCfg, nestedRequest) => {
            const nested = await executeAutomationGraph({
              ...params,
              cfg: nestedCfg,
              request: nestedRequest,
              persistFormData: false,
              callDepth: callDepth + 1,
            });
            return {
              ok: nested.ok,
              message: nested.message,
              result: {
                trace: nested.trace,
                stateResults: nested.stateResults,
                mergePatch: nested.mergePatch,
                warnings: nested.warnings,
              },
            };
          },
        });
        if (executed) native = { ok: executed.ok, message: executed.message, result: executed.result };
      } catch (err) {
        native = {
          ok: false,
          message: err instanceof Error ? err.message : String(err),
          result: undefined,
        };
      }

      lastResponse = {
        status: native.ok ? 200 : 500,
        bodyText: native.message,
        bodyJson: native.result,
      };
      stateResults[state.id] = {
        ok: native.ok,
        status: lastResponse.status,
        body: native.result !== undefined ? native.result : native.message,
        text: native.message,
      };
      mergePatch[`automation_${state.id}_ok`] = native.ok;
      mergePatch[`automation_${state.id}_status`] = lastResponse.status;

      if (native.ok) {
        current = selectTransition(state.transitions, 'success') || selectTransition(state.transitions, null);
        if (!current) {
          terminal = { ok: true, message: native.message, rejectRequest: false };
          break;
        }
        continue;
      }

      current = selectTransition(state.transitions, 'failure');
      if (!current) {
        terminal = { ok: false, message: native.message, rejectRequest: false };
        break;
      }
      continue;
    }

    if (
      state.type !== 'activity' &&
      state.type !== 'action.rest' &&
      state.type !== 'action.ci.create' &&
      state.type !== 'action.ci.lookup'
    ) {
      throw new Error(`Unsupported action state type: ${(state as AutomationState).type}`);
    }

    const activity = state;
    const attempts = Math.max(1, Math.min(Number(activity.retryAttempts || 1), 10));
    const backoffMs = Math.max(0, Math.min(Number(activity.retryBackoffSec || 0), 300)) * 1000;

    let lastErr: string | null = null;
    let http: { ok: boolean; status: number; bodyText: string; bodyJson: unknown } | null = null;

    for (let i = 1; i <= attempts; i += 1) {
      const ctx = buildTemplateContext({ request, response: lastResponse, cred: credMap, state: stateResults });
      const resolvedActivity = toHttpActivityState(activity, ctx);
      try {
        http = await runHttpStep(resolvedActivity, ctx, automationSharedKey);
        if (http.ok) break;
        lastErr = `HTTP ${http.status}`;
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
      }
      if (i < attempts && backoffMs > 0) await sleepMs(backoffMs);
    }

    const effectiveResponse =
      http || { ok: false, status: 0, bodyText: lastErr || 'Request failed', bodyJson: undefined };
    lastResponse = {
      status: effectiveResponse.status,
      bodyText: effectiveResponse.bodyText,
      bodyJson: effectiveResponse.bodyJson,
    };
    const ctxAfter = buildTemplateContext({ request, response: lastResponse, cred: credMap, state: stateResults });
    stateResults[state.id] = {
      ok: effectiveResponse.ok,
      status: effectiveResponse.status,
      body: effectiveResponse.bodyJson !== undefined ? effectiveResponse.bodyJson : effectiveResponse.bodyText,
      text: effectiveResponse.bodyText,
    };
    mergePatch[`automation_${state.id}_status`] = effectiveResponse.status;
    mergePatch[`automation_${state.id}_ok`] = effectiveResponse.ok;

    if (effectiveResponse.ok) {
      const fx = applyBranchEffects(activity.onSuccess, ctxAfter, mergePatch, skipOrders);
      current = fx.nextStateId || selectTransition(activity.transitions, 'success') || selectTransition(activity.transitions, null);
      if (!current) {
        terminal = { ok: true, message: `Activity ${activity.id} completed`, rejectRequest: fx.rejectRequest };
        break;
      }
      if (fx.rejectRequest) {
        terminal = { ok: false, message: `Activity ${activity.id} requested rejectRequest`, rejectRequest: true };
        break;
      }
      continue;
    }

    const fxFailure = applyBranchEffects(activity.onFailure, ctxAfter, mergePatch, skipOrders);
    if (activity.onError === 'continue') {
      current = fxFailure.nextStateId || selectTransition(activity.transitions, 'success') || selectTransition(activity.transitions, null);
      if (!current) {
        terminal = { ok: true, message: `Activity ${activity.id} continued after error`, rejectRequest: fxFailure.rejectRequest };
        break;
      }
      continue;
    }
    if (activity.onError === 'fallback' && activity.fallbackNodeId) {
      current = activity.fallbackNodeId;
      if (fxFailure.rejectRequest) {
        terminal = { ok: false, message: `Activity ${activity.id} requested rejectRequest`, rejectRequest: true };
        break;
      }
      continue;
    }

    current = fxFailure.nextStateId || selectTransition(activity.transitions, 'failure');
    if (!current) {
      terminal = {
        ok: false,
        message: `Activity ${activity.id} failed: ${effectiveResponse.status || lastErr || 'unknown error'}`,
        rejectRequest: fxFailure.rejectRequest,
      };
      break;
    }
    if (fxFailure.rejectRequest) {
      terminal = { ok: false, message: `Activity ${activity.id} requested rejectRequest`, rejectRequest: true };
      break;
    }
  }

  if (!terminal) {
    terminal = {
      ok: false,
      message: `Automation exceeded max execution steps (${MAX_EXECUTION_STEPS})`,
      rejectRequest: false,
    };
  }

  if (persistFormData && client && requestId && Object.keys(mergePatch).length > 0) {
    await client.query(
      `UPDATE requests SET form_data = form_data || $1::jsonb, updated_at = now() WHERE id = $2`,
      [JSON.stringify(mergePatch), requestId],
    );
  }

  const skipTaskOrders = [...skipOrders].sort((a, b) => a - b);
  return {
    ok: terminal.ok,
    message: terminal.message,
    rejectRequest: terminal.rejectRequest,
    skipTaskOrders,
    notes: {
      automation: 'state_machine',
      trace,
      mergeKeys: Object.keys(mergePatch),
      skipTaskOrders: [...skipOrders],
      rejectRequest: terminal.rejectRequest,
      message: terminal.message,
    },
    trace,
    mergePatch,
    stateResults,
    warnings,
  };
}
