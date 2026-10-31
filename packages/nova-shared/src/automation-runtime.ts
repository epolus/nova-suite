/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  type AdvancedCondition,
  type AutomationActivityState,
  type AutomationApproverType,
  type AutomationBranch,
  AUTOMATION_LOOP_DEFAULT_MAX_ITERATIONS,
  AUTOMATION_LOOP_MAX_ITERATIONS_LIMIT,
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
import { replacePlaceholders, singlePlaceholder } from './placeholders';

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
  /** Overrides the computed step budget (default scales with loop sizes). */
  maxExecutionSteps?: number;
  /** When true, `action.approval` and `action.task` suspend the run and return a checkpoint instead of failing. */
  allowSuspend?: boolean;
  /** Continue a run that previously suspended on an approval or manual task state. */
  resume?: { checkpoint: AutomationCheckpoint; outcome: AutomationResumeOutcome };
};

export type AutomationLoopIterator = { items: unknown[]; index: number };

export type AutomationCheckpoint = {
  version: 1;
  stateId: string;
  stateResults: Record<string, unknown>;
  vars: Record<string, unknown>;
  loops: Record<string, AutomationLoopIterator>;
  steps: number;
  trace: string[];
};

export type AutomationResumeOutcome = 'approved' | 'rejected' | 'completed';

export type AutomationSuspension =
  | {
      kind: 'approval';
      stateId: string;
      approval: {
        name: string;
        instructions: string;
        approverType: AutomationApproverType;
        approver: string;
      };
      checkpoint: AutomationCheckpoint;
    }
  | {
      kind: 'task';
      stateId: string;
      task: {
        name: string;
        instructions: string;
        group: string;
        assignee: string;
        wait: boolean;
      };
      checkpoint: AutomationCheckpoint;
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
  suspended?: AutomationSuspension;
};

export function computeDefaultMaxExecutionSteps(cfg: AutomationConfig): number {
  let budget = MAX_EXECUTION_STEPS;
  for (const s of cfg.states) {
    if (s.type !== 'loop.foreach') continue;
    const iterations = Math.min(
      s.maxIterations ?? AUTOMATION_LOOP_DEFAULT_MAX_ITERATIONS,
      AUTOMATION_LOOP_MAX_ITERATIONS_LIMIT,
    );
    budget += iterations * (cfg.states.length + 1);
  }
  return Math.min(budget, 20_000);
}

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
  vars?: Record<string, unknown>;
  loops?: Record<string, AutomationLoopIterator>;
}): Record<string, unknown> {
  const { request, response, cred, state, vars, loops } = params;
  const loop: Record<string, unknown> = {};
  for (const [id, it] of Object.entries(loops ?? {})) {
    loop[id] = { item: it.items[it.index], index: it.index, count: it.items.length };
  }
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
      requester_email: request.requester_email,
      requested_for: request.requested_for,
      requested_for_email: request.requested_for_email,
      assigned_to: request.assigned_to,
      created_at: request.created_at instanceof Date ? request.created_at.toISOString() : (request.created_at ?? ''),
      notes: request.notes ?? '',
      quantity: 1,
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
    vars: vars ?? {},
    loop,
  };
}

/** Like interpolateString, but a template that is exactly one placeholder keeps the raw (non-string) value. */
export function resolveTemplateValue(template: string, ctx: Record<string, unknown>): unknown {
  const inner = singlePlaceholder(template);
  if (inner !== null && !inner.trim().startsWith('env.')) {
    return getByPath(ctx, inner.trim().replace(/\[(\w+)\]/g, '.$1'));
  }
  return interpolateString(template, ctx);
}

export function resolveLoopItems(itemsExpr: string, ctx: Record<string, unknown>): unknown[] {
  const v = resolveTemplateValue(itemsExpr, ctx);
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined) return [];
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return [];
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s) as unknown;
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // fall through to comma-separated parsing
      }
    }
    return s.split(',').map((p) => p.trim()).filter(Boolean);
  }
  return [v];
}

function interpolateString(template: string, ctx: Record<string, unknown>): string {
  return replacePlaceholders(template, (rawKey) => {
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
  const re = /\{\{\s*cred\.([A-Za-z0-9_]+)(?:\.[^}\s.{]+)*\s*\}\}/g;
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
    if (s.type === 'loop.foreach') collectCredSlugsFromText(s.itemsExpr || '', slugs);
    if (s.type === 'variables.set') {
      for (const v of Object.values(s.assignments || {})) collectCredSlugsFromText(String(v), slugs);
    }
    if (s.type === 'action.approval') {
      collectCredSlugsFromText(s.approverTemplate || '', slugs);
      collectCredSlugsFromText(s.instructions || '', slugs);
    }
    if (s.type === 'action.task') {
      for (const t of [s.name, s.instructions, s.groupTemplate, s.assigneeTemplate]) collectCredSlugsFromText(t || '', slugs);
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

type Terminal = { ok: boolean; message: string; rejectRequest: boolean };

type SegmentOutcome =
  | { kind: 'terminal'; terminal: Terminal }
  | { kind: 'reachedStop' }
  | { kind: 'suspended'; suspension: SuspensionWithoutCheckpoint };

type SuspensionWithoutCheckpoint = AutomationSuspension extends infer S
  ? S extends AutomationSuspension ? Omit<S, 'checkpoint'> : never
  : never;

function normalizeApproverType(raw: unknown): AutomationApproverType {
  return raw === 'user' || raw === 'group' || raw === 'group_manager' || raw === 'department_manager'
    ? raw
    : 'requester_manager';
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
    resume,
  } = params;
  const callDepth = params.callDepth ?? 0;
  const persistFormData =
    params.persistFormData ?? Boolean(client && requestId);
  const maxSteps = params.maxExecutionSteps ?? computeDefaultMaxExecutionSteps(cfg);
  const skipOrders = new Set<number>();
  const mergePatch: Record<string, unknown> = {};
  const trace: string[] = resume ? [...resume.checkpoint.trace] : [];
  const stateResults: Record<string, unknown> = resume ? { ...resume.checkpoint.stateResults } : {};
  const vars: Record<string, unknown> = resume ? { ...resume.checkpoint.vars } : {};
  const loops: Record<string, AutomationLoopIterator> = resume ? { ...resume.checkpoint.loops } : {};
  const warnings: string[] = [];
  const byId = new Map(cfg.states.map((s) => [s.id, s]));
  const counter = { step: resume ? resume.checkpoint.steps : 0 };
  let lastResponse: { status: number; bodyText: string; bodyJson: unknown } | undefined;

  const ctxNow = () =>
    buildTemplateContext({ request, response: lastResponse, cred: credMap, state: stateResults, vars, loops });
  const term = (ok: boolean, message: string, rejectRequest = false): SegmentOutcome => ({
    kind: 'terminal',
    terminal: { ok, message, rejectRequest },
  });

  async function runSegment(startId: string | null, stopAt: string | null): Promise<SegmentOutcome> {
    let current: string | null = startId;
    while (current) {
      if (stopAt && current === stopAt) return { kind: 'reachedStop' };
      if (counter.step >= maxSteps) break;
      counter.step += 1;
      const step = counter.step;
      const state = byId.get(current);
      if (!state) return term(false, `Unknown state id: ${current}`);
      trace.push(`${step}:${state.id}:${state.type}`);

      if (state.type === 'end') {
        const endOk = state.result !== 'failure';
        const branch = endOk ? state.onSuccess : state.onFailure;
        const fx = applyBranchEffects(branch, ctxNow(), mergePatch, skipOrders);
        return term(endOk, endOk ? 'Reached end state (success)' : 'Reached end state (failure)', fx.rejectRequest);
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
        if (!current) return term(true, `Delay state ${state.id} has no next transition`);
        continue;
      }

      if (state.type === 'decision' || state.type === 'decision.advanced') {
        const ctx = ctxNow();
        const branchBool = state.type === 'decision'
          ? evaluateDecision(state.condition, ctx)
          : evaluateAdvancedCondition(state.expression, ctx);
        const when = branchBool ? 'true' : 'false';
        stateResults[state.id] = { result: branchBool };
        mergePatch[`automation_${state.id}_result`] = branchBool;
        mergePatch[`automation_${state.id}_when`] = when;
        current = selectTransition(state.transitions, when);
        if (!current) return term(false, `Decision state ${state.id} has no ${when} transition`);
        continue;
      }

      if (state.type === 'variables.set') {
        const ctx = ctxNow();
        const assigned: Record<string, unknown> = {};
        for (const [key, tmpl] of Object.entries(state.assignments || {})) {
          assigned[key] = resolveTemplateValue(String(tmpl), ctx);
          vars[key] = assigned[key];
        }
        stateResults[state.id] = { ok: true, body: assigned };
        current = selectTransition(state.transitions, null);
        if (!current) return term(true, `Variables state ${state.id} has no next transition`);
        continue;
      }

      if (state.type === 'loop.foreach') {
        const max = Math.max(
          1,
          Math.min(state.maxIterations ?? AUTOMATION_LOOP_DEFAULT_MAX_ITERATIONS, AUTOMATION_LOOP_MAX_ITERATIONS_LIMIT),
        );
        let it = loops[state.id];
        if (!it) {
          it = { items: resolveLoopItems(state.itemsExpr, ctxNow()), index: -1 };
          loops[state.id] = it;
        }
        it.index += 1;
        if (it.index < it.items.length && it.index < max) {
          current = selectTransition(state.transitions, 'item');
        } else {
          if (it.items.length > max) {
            warnings.push(`Loop ${state.id} stopped after maxIterations=${max} (${it.items.length} items)`);
          }
          stateResults[state.id] = { ok: true, iterations: Math.min(it.items.length, max) };
          delete loops[state.id];
          current = selectTransition(state.transitions, 'done');
        }
        if (!current) return term(false, `Loop state ${state.id} has no matching transition`);
        continue;
      }

      if (state.type === 'parallel.fork') {
        const branches = (state.transitions || []).map((t) => t.to);
        const outcomes = await Promise.all(branches.map((b) => runSegment(b, state.joinId)));
        if (outcomes.some((o) => o.kind === 'suspended')) {
          return term(false, `Approval and manual task steps inside parallel branches are not supported (fork ${state.id})`);
        }
        const failed = outcomes.find((o) => o.kind === 'terminal' && !o.terminal.ok);
        if (failed) return failed;
        const ended = outcomes.find((o) => o.kind === 'terminal');
        if (ended) return ended;
        stateResults[state.id] = { ok: true, branches: branches.length };
        current = state.joinId;
        if (stopAt && current === stopAt) return { kind: 'reachedStop' };
        continue;
      }

      if (state.type === 'parallel.join') {
        current = selectTransition(state.transitions, null);
        if (!current) return term(true, `Join state ${state.id} has no next transition`);
        continue;
      }

      if (state.type === 'action.approval') {
        const ctx = ctxNow();
        if (params.dryRun) {
          warnings.push(`Approval ${state.id} auto-approved in dry-run`);
          stateResults[state.id] = { ok: true, outcome: 'approved', body: { outcome: 'approved' } };
          current = selectTransition(state.transitions, 'approved');
          if (!current) return term(true, `Approval ${state.id} has no approved transition`);
          continue;
        }
        if (!params.allowSuspend) {
          return term(false, `Approval step ${state.id} requires a catalog fulfillment context`);
        }
        return {
          kind: 'suspended',
          suspension: {
            kind: 'approval',
            stateId: state.id,
            approval: {
              name: interpolateString(state.name || 'Approval', ctx),
              instructions: interpolateString(state.instructions || '', ctx),
              approverType: normalizeApproverType(state.approverType),
              approver: interpolateString(state.approverTemplate || '', ctx),
            },
          },
        };
      }

      if (state.type === 'action.task') {
        const ctx = ctxNow();
        const task = {
          name: interpolateString(state.name || 'Manual task', ctx),
          instructions: interpolateString(state.instructions || '', ctx),
          group: interpolateString(state.groupTemplate || '', ctx),
          assignee: interpolateString(state.assigneeTemplate || '', ctx),
          wait: state.wait !== false,
        };
        if (params.dryRun) {
          warnings.push(`Manual task ${state.id} ("${task.name}") skipped in dry-run`);
          stateResults[state.id] = { ok: true, status: 200, body: { outcome: 'completed', ...task } };
          current = selectTransition(state.transitions, 'success') || selectTransition(state.transitions, null);
          if (!current) return term(true, `Manual task ${state.id} has no next transition`);
          continue;
        }
        if (!params.allowSuspend) {
          return term(false, `Manual task step ${state.id} requires a catalog fulfillment context`);
        }
        return { kind: 'suspended', suspension: { kind: 'task', stateId: state.id, task } };
      }

      if (
        state.type === 'action.notification' ||
        state.type === 'action.ticket' ||
        state.type === 'action.assign' ||
        state.type === 'action.script' ||
        state.type === 'call.workflow'
      ) {
        const ctx = ctxNow();
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
                maxExecutionSteps: undefined,
                allowSuspend: false,
                resume: undefined,
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
          if (!current) return term(true, native.message);
          continue;
        }

        current = selectTransition(state.transitions, 'failure');
        if (!current) return term(false, native.message);
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
        const ctx = ctxNow();
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
      const ctxAfter = ctxNow();
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
        if (!current) return term(true, `Activity ${activity.id} completed`, fx.rejectRequest);
        if (fx.rejectRequest) return term(false, `Activity ${activity.id} requested rejectRequest`, true);
        continue;
      }

      const fxFailure = applyBranchEffects(activity.onFailure, ctxAfter, mergePatch, skipOrders);
      if (activity.onError === 'continue') {
        current = fxFailure.nextStateId || selectTransition(activity.transitions, 'success') || selectTransition(activity.transitions, null);
        if (!current) return term(true, `Activity ${activity.id} continued after error`, fxFailure.rejectRequest);
        continue;
      }
      if (activity.onError === 'fallback' && activity.fallbackNodeId) {
        current = activity.fallbackNodeId;
        if (fxFailure.rejectRequest) return term(false, `Activity ${activity.id} requested rejectRequest`, true);
        continue;
      }

      current = fxFailure.nextStateId || selectTransition(activity.transitions, 'failure');
      if (!current) {
        return term(
          false,
          `Activity ${activity.id} failed: ${effectiveResponse.status || lastErr || 'unknown error'}`,
          fxFailure.rejectRequest,
        );
      }
      if (fxFailure.rejectRequest) return term(false, `Activity ${activity.id} requested rejectRequest`, true);
    }
    if (!current) return term(false, 'Automation stopped without reaching an end state');
    return term(false, `Automation exceeded max execution steps (${maxSteps})`);
  }

  let startId: string | null = cfg.startAt;
  if (resume) {
    const approvalState = byId.get(resume.checkpoint.stateId);
    if (approvalState?.type === 'action.task') {
      stateResults[approvalState.id] = { ok: true, status: 200, body: { outcome: 'completed' } };
      trace.push(`resume:${approvalState.id}:completed`);
      startId = selectTransition(approvalState.transitions, 'success') || selectTransition(approvalState.transitions, null);
    } else if (!approvalState || approvalState.type !== 'action.approval' || resume.outcome === 'completed') {
      startId = null;
    } else {
      const outcome = resume.outcome;
      stateResults[approvalState.id] = { ok: true, outcome, status: 200, body: { outcome } };
      mergePatch[`automation_${approvalState.id}_outcome`] = outcome;
      trace.push(`resume:${approvalState.id}:${outcome}`);
      startId = selectTransition(approvalState.transitions, outcome);
    }
  }

  const outcome: SegmentOutcome = startId
    ? await runSegment(startId, null)
    : term(false, `Cannot resume: checkpoint state ${resume?.checkpoint.stateId ?? ''} is not a resumable approval or task step`);

  let suspended: AutomationSuspension | undefined;
  let terminal: Terminal;
  if (outcome.kind === 'suspended') {
    suspended = {
      ...outcome.suspension,
      checkpoint: {
        version: 1,
        stateId: outcome.suspension.stateId,
        stateResults,
        vars,
        loops,
        steps: counter.step,
        trace,
      },
    };
    terminal = { ok: true, message: `Suspended on ${outcome.suspension.kind} ${outcome.suspension.stateId}`, rejectRequest: false };
  } else if (outcome.kind === 'reachedStop') {
    terminal = { ok: true, message: 'Reached stop state', rejectRequest: false };
  } else {
    terminal = outcome.terminal;
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
      ...(suspended ? { suspendedAt: suspended.stateId } : {}),
    },
    trace,
    mergePatch,
    stateResults,
    warnings,
    ...(suspended ? { suspended } : {}),
  };
}

