/* SPDX-License-Identifier: AGPL-3.0-only */
import { log } from '@temporalio/activity';
import { withTenantContext } from '../db';
import { loadCredentialSecretsBySlugs } from '../credentials/vault';

export interface ExecuteAutomatedCatalogTaskInput {
  requestTaskId: string;
  requestId: string;
  tenantId: string;
}

export interface ExecuteAutomatedCatalogTaskResult {
  ok: boolean;
  message?: string;
  rejectRequest?: boolean;
  skipTaskOrders?: number[];
}

interface AutomationBranch {
  skipTaskOrders?: number[];
  rejectRequest?: boolean;
  mergeFormData?: Record<string, string>;
  nextStateId?: string;
}

interface AutomationTransition {
  to: string;
  when?: string;
}

interface AutomationActivityState {
  id: string;
  type: 'activity';
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
  timeoutSeconds?: number;
  retryAttempts?: number;
  retryBackoffSec?: number;
  onError?: 'fail' | 'continue' | 'fallback';
  fallbackNodeId?: string;
  transitions?: AutomationTransition[];
  onSuccess?: AutomationBranch;
  onFailure?: AutomationBranch;
}

interface AutomationDecisionState {
  id: string;
  type: 'decision';
  condition: string;
  transitions: AutomationTransition[];
}

interface AutomationDelayState {
  id: string;
  type: 'delay';
  delaySeconds: number;
  transitions: AutomationTransition[];
}

interface AutomationEndState {
  id: string;
  type: 'end';
  result?: 'success' | 'failure';
  onSuccess?: AutomationBranch;
  onFailure?: AutomationBranch;
}

type AutomationState =
  | AutomationActivityState
  | AutomationDecisionState
  | AutomationDelayState
  | AutomationEndState;

interface AutomationGraphConfig {
  kind: 'state_machine';
  startAt: string;
  states: AutomationState[];
}

const MAX_EXECUTION_STEPS = 120;

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
  cred?: Record<string, string>;
}): Record<string, unknown> {
  const { request, response, cred } = params;
  const formData = (request.form_data as Record<string, unknown>) || {};
  const deliveryInfo = (request.delivery_info as Record<string, unknown>) || {};
  return {
    request: {
      id: request.id,
      number: request.number,
      status: request.status,
      form_data: formData,
      delivery_info: deliveryInfo,
    },
    response: response
      ? {
          status: response.status,
          body: response.bodyJson !== undefined ? response.bodyJson : response.bodyText,
          text: response.bodyText,
        }
      : {},
    cred: cred ?? {},
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

function parseConfig(raw: unknown): AutomationGraphConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cfg = raw as Record<string, unknown>;
  if (cfg.kind !== 'state_machine') return null;
  if (typeof cfg.startAt !== 'string' || !cfg.startAt.trim()) return null;
  if (!Array.isArray(cfg.states) || cfg.states.length === 0) return null;
  const states = cfg.states as AutomationState[];
  const byId = new Set(states.map((s) => s.id));
  if (!byId.has(cfg.startAt)) return null;
  return {
    kind: 'state_machine',
    startAt: cfg.startAt,
    states,
  };
}

function collectCredSlugsFromText(raw: string, out: Set<string>): void {
  const re = /\{\{\s*cred\.([A-Za-z0-9_]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(raw)) !== null) out.add(m[1]);
}

function collectCredSlugsFromAutomation(cfg: AutomationGraphConfig): string[] {
  const slugs = new Set<string>();
  for (const s of cfg.states) {
    if (s.type === 'activity') {
      collectCredSlugsFromText(s.url || '', slugs);
      if (s.body) collectCredSlugsFromText(s.body, slugs);
      for (const v of Object.values(s.headers || {})) collectCredSlugsFromText(v, slugs);
      for (const b of [s.onSuccess, s.onFailure]) {
        for (const v of Object.values(b?.mergeFormData || {})) collectCredSlugsFromText(v, slugs);
      }
    }
    if (s.type === 'decision') collectCredSlugsFromText(s.condition, slugs);
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
): Promise<{ ok: boolean; status: number; bodyText: string; bodyJson: unknown }> {
  const method = (state.method || 'GET').toUpperCase();
  const url = interpolateString(state.url, ctxBeforeRequest);
  const headers = interpolateRecord(state.headers, ctxBeforeRequest) || {};
  const body =
    state.body === undefined || state.body === null
      ? undefined
      : interpolateString(state.body, ctxBeforeRequest);
  const timeoutMs = Math.min(Math.max((state.timeoutSeconds ?? 30) * 1000, 1000), 120_000);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...headers,
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

function truncateNotes(s: string, max = 8000): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
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

async function sleepMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeAutomationGraph(params: {
  cfg: AutomationGraphConfig;
  request: Record<string, unknown>;
  credMap: Record<string, string>;
  requestId: string;
  client: {
    query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  };
}): Promise<{
  ok: boolean;
  message: string;
  rejectRequest: boolean;
  skipTaskOrders: number[];
  notes: Record<string, unknown>;
}> {
  const { cfg, request, credMap, requestId, client } = params;
  const byId = new Map(cfg.states.map((s) => [s.id, s]));
  const skipOrders = new Set<number>();
  const mergePatch: Record<string, unknown> = {};
  const trace: string[] = [];

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
      const ctx = buildTemplateContext({ request, response: lastResponse, cred: credMap });
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
      await sleepMs(delaySec * 1000);
      current = selectTransition(state.transitions, null);
      if (!current) {
        terminal = { ok: true, message: `Delay state ${state.id} has no next transition`, rejectRequest: false };
        break;
      }
      continue;
    }

    if (state.type === 'decision') {
      const ctx = buildTemplateContext({ request, response: lastResponse, cred: credMap });
      const branchBool = evaluateDecision(state.condition, ctx);
      const when = branchBool ? 'true' : 'false';
      current = selectTransition(state.transitions, when);
      if (!current) {
        terminal = { ok: false, message: `Decision state ${state.id} has no ${when} transition`, rejectRequest: false };
        break;
      }
      continue;
    }

    const activity = state;
    const attempts = Math.max(1, Math.min(Number(activity.retryAttempts || 1), 10));
    const backoffMs = Math.max(0, Math.min(Number(activity.retryBackoffSec || 0), 300)) * 1000;

    let lastErr: string | null = null;
    let http: { ok: boolean; status: number; bodyText: string; bodyJson: unknown } | null = null;

    for (let i = 1; i <= attempts; i += 1) {
      const ctx = buildTemplateContext({ request, response: lastResponse, cred: credMap });
      try {
        http = await runHttpStep(activity, ctx);
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
    const ctxAfter = buildTemplateContext({ request, response: lastResponse, cred: credMap });

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

  if (Object.keys(mergePatch).length > 0) {
    await client.query(
      `UPDATE requests SET form_data = form_data || $1::jsonb, updated_at = now() WHERE id = $2`,
      [JSON.stringify(mergePatch), requestId],
    );
  }

  return {
    ok: terminal.ok,
    message: terminal.message,
    rejectRequest: terminal.rejectRequest,
    skipTaskOrders: [...skipOrders].sort((a, b) => a - b),
    notes: {
      automation: 'state_machine',
      trace,
      mergeKeys: Object.keys(mergePatch),
      skipTaskOrders: [...skipOrders],
      rejectRequest: terminal.rejectRequest,
      message: terminal.message,
    },
  };
}

export async function skipRequestTasksByOrders(
  requestId: string,
  tenantId: string,
  taskOrders: number[],
): Promise<void> {
  if (taskOrders.length === 0) return;
  log.info('Skipping request tasks by orders', { requestId, taskOrders });
  await withTenantContext(tenantId, async (client) => {
    await client.query(
      `UPDATE request_tasks
       SET status = 'skipped',
           notes = COALESCE(notes, '') || E'\nSkipped by catalog automation branch.',
           completed_at = now()
       WHERE request_id = $1 AND task_order = ANY($2::int[])
         AND status IN ('pending', 'in_progress')`,
      [requestId, taskOrders],
    );
  });
}

export async function executeAutomatedCatalogTask(
  input: ExecuteAutomatedCatalogTaskInput,
): Promise<ExecuteAutomatedCatalogTaskResult> {
  const { requestTaskId, requestId, tenantId } = input;
  log.info('executeAutomatedCatalogTask', { requestTaskId, requestId });

  return withTenantContext(tenantId, async (client) => {
    const taskRow = await client.query(
      `SELECT rt.id, rt.task_order, rt.task_type, rt.status, rt.name,
              ct.automation_config
       FROM request_tasks rt
       LEFT JOIN catalog_tasks ct ON ct.id = rt.catalog_task_id
       WHERE rt.id = $1 AND rt.request_id = $2`,
      [requestTaskId, requestId],
    );
    if (taskRow.rows.length === 0) return { ok: false, message: 'Request task not found' };

    const row = taskRow.rows[0] as Record<string, unknown>;
    if (row.task_type !== 'automated') return { ok: false, message: 'Not an automated task' };
    if (row.status !== 'in_progress' && row.status !== 'pending') return { ok: true, message: 'Task already finalized' };

    const cfg = parseConfig(row.automation_config);
    if (!cfg) {
      const msg = 'Invalid or missing automation_config (expected kind state_machine with startAt/states).';
      await client.query(
        `UPDATE request_tasks SET status = 'failed', completed_at = now(), notes = $1 WHERE id = $2`,
        [msg, requestTaskId],
      );
      return { ok: false, message: msg };
    }

    const reqRes = await client.query(
      `SELECT id, number, status, form_data, delivery_info FROM requests WHERE id = $1`,
      [requestId],
    );
    if (reqRes.rows.length === 0) return { ok: false, message: 'Request not found' };

    const request = reqRes.rows[0] as Record<string, unknown>;
    const slugList = collectCredSlugsFromAutomation(cfg);
    const credMap = await loadCredentialSecretsBySlugs(client, tenantId, slugList);

    const result = await executeAutomationGraph({
      cfg,
      request,
      credMap,
      requestId,
      client,
    });

    await client.query(
      `UPDATE request_tasks SET status = $1, completed_at = now(), completed_by = NULL, notes = $2 WHERE id = $3`,
      [result.ok ? 'completed' : 'failed', truncateNotes(JSON.stringify(result.notes)), requestTaskId],
    );

    return {
      ok: result.ok,
      message: result.message,
      rejectRequest: result.rejectRequest,
      skipTaskOrders: result.skipTaskOrders,
    };
  });
}
