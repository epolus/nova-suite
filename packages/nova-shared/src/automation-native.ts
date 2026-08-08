/* SPDX-License-Identifier: AGPL-3.0-only */
import vm from 'node:vm';
import {
  parseAutomationConfig,
  type AutomationAssignActionState,
  type AutomationCallWorkflowState,
  type AutomationConfig,
  type AutomationNotificationActionState,
  type AutomationScriptActionState,
  type AutomationState,
  type AutomationTicketActionState,
} from './automation-config';

export type AutomationDbClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type AutomationSendEmail = (input: {
  to: string;
  subject: string;
  text: string;
}) => Promise<{ ok: boolean; error?: string }>;

export type NativeActionResult = {
  ok: boolean;
  message: string;
  result?: unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SUBGRAPH_DEPTH = 3;
const SCRIPT_TIMEOUT_MS = 250;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function interpolateString(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey: string) => {
    const key = rawKey.trim();
    const envMatch = /^env\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(key);
    if (envMatch) {
      const v = process.env[envMatch[1]];
      return v !== undefined ? v : '';
    }
    const parts = key.replace(/\[(\w+)\]/g, '.$1').split('.').filter(Boolean);
    let cur: unknown = ctx;
    for (const p of parts) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return '';
      cur = (cur as Record<string, unknown>)[p];
    }
    if (cur === null || cur === undefined) return '';
    if (typeof cur === 'object') return JSON.stringify(cur);
    return String(cur);
  });
}

function interpolateUnknown(input: unknown, ctx: Record<string, unknown>): unknown {
  if (typeof input === 'string') return interpolateString(input, ctx);
  if (Array.isArray(input)) return input.map((v) => interpolateUnknown(v, ctx));
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = interpolateUnknown(v, ctx);
    }
    return out;
  }
  return input;
}

async function resolveUserIds(
  client: AutomationDbClient,
  recipientType: string,
  request: Record<string, unknown>,
  requestTaskId?: string,
): Promise<string[]> {
  const token = recipientType.trim();
  if (!token) return [];

  if (isUuid(token)) {
    const found = await client.query(
      `SELECT id FROM users WHERE id = $1::uuid AND tenant_id = current_tenant_id() AND is_active = true`,
      [token],
    );
    return found.rows.map((r) => String(r.id));
  }

  if (token.includes('@')) {
    const found = await client.query(
      `SELECT id FROM users WHERE lower(email) = lower($1) AND tenant_id = current_tenant_id() AND is_active = true`,
      [token],
    );
    return found.rows.map((r) => String(r.id));
  }

  const ids = new Set<string>();
  const requesterId = asString(request.requester_id);
  const requestedFor = asString(request.requested_for);
  const assignedTo = asString(request.assigned_to);

  if (token === 'requester' && isUuid(requesterId)) ids.add(requesterId);
  if ((token === 'requested_for' || token === 'requestedFor') && isUuid(requestedFor)) ids.add(requestedFor);
  if (token === 'assignee' && isUuid(assignedTo)) ids.add(assignedTo);

  if (token === 'assignee' && requestTaskId && isUuid(requestTaskId)) {
    const task = await client.query(
      `SELECT assigned_to FROM request_tasks WHERE id = $1::uuid`,
      [requestTaskId],
    );
    const uid = asString(task.rows[0]?.assigned_to);
    if (isUuid(uid)) ids.add(uid);
  }

  const requestId = asString(request.id);
  if (ids.size === 0 && isUuid(requestId) && (token === 'requester' || token === 'requested_for' || token === 'assignee')) {
    const req = await client.query(
      `SELECT requester_id, requested_for FROM requests WHERE id = $1::uuid`,
      [requestId],
    );
    const row = req.rows[0] || {};
    if (token === 'requester' && isUuid(asString(row.requester_id))) ids.add(asString(row.requester_id));
    if (token === 'requested_for' && isUuid(asString(row.requested_for))) ids.add(asString(row.requested_for));
  }

  return [...ids];
}

async function executeNotification(
  state: AutomationNotificationActionState,
  ctx: Record<string, unknown>,
  params: {
    client?: AutomationDbClient;
    request: Record<string, unknown>;
    requestTaskId?: string;
    sendEmail?: AutomationSendEmail;
  },
): Promise<NativeActionResult> {
  if (!params.client) {
    return { ok: false, message: 'action.notification requires a database client' };
  }
  const channel = state.channel === 'email' ? 'email' : 'in_app';
  const recipientType = interpolateString(state.recipientType || 'assignee', ctx);
  const title = interpolateString(state.titleTemplate || 'Catalog automation', ctx);
  const body = interpolateString(state.bodyTemplate || '', ctx);
  const userIds = await resolveUserIds(params.client, recipientType, params.request, params.requestTaskId);
  if (userIds.length === 0) {
    return { ok: false, message: `No recipients resolved for recipientType "${recipientType}"` };
  }

  const users = await params.client.query(
    `SELECT id, email FROM users
     WHERE id = ANY($1::uuid[]) AND tenant_id = current_tenant_id() AND is_active = true`,
    [userIds],
  );
  const requestId = asString(params.request.id);
  const entityId = isUuid(requestId) ? requestId : null;
  const delivered: Array<{ userId: string; channel: string }> = [];

  for (const row of users.rows) {
    const userId = String(row.id);
    if (channel === 'in_app') {
      await params.client.query(
        `INSERT INTO notifications (tenant_id, user_id, type, title, body, entity_type, entity_id)
         VALUES (current_tenant_id(), $1::uuid, 'workflow', $2, $3, 'request', $4::uuid)`,
        [userId, title, body, entityId],
      );
      delivered.push({ userId, channel: 'in_app' });
      continue;
    }
    const email = asString(row.email);
    if (!email) {
      return { ok: false, message: `User ${userId} has no email address` };
    }
    if (!params.sendEmail) {
      return { ok: false, message: 'Email channel requires SMTP (MAIL_NOTIFICATIONS_ENABLED / SMTP_HOST)' };
    }
    const sent = await params.sendEmail({ to: email, subject: title, text: body });
    if (!sent.ok) {
      return { ok: false, message: sent.error || `Failed to send email to ${email}` };
    }
    delivered.push({ userId, channel: 'email' });
  }

  return { ok: true, message: `Notification sent via ${channel}`, result: { channel, delivered } };
}

async function resolveJournalAuthorId(client: AutomationDbClient, preferred?: string): Promise<string | null> {
  if (preferred && isUuid(preferred)) {
    const preferredRow = await client.query(
      `SELECT id FROM users WHERE id = $1::uuid AND tenant_id = current_tenant_id() AND is_active = true`,
      [preferred],
    );
    if (preferredRow.rows[0]?.id) return String(preferredRow.rows[0].id);
  }
  const roleMatch = await client.query(
    `SELECT u.id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
     JOIN roles r ON r.id = ur.role_id AND r.tenant_id = u.tenant_id
     WHERE u.tenant_id = current_tenant_id()
       AND u.is_active = true
       AND r.name IN ('admin', 'fulfiller')
     ORDER BY CASE r.name WHEN 'admin' THEN 0 ELSE 1 END, u.created_at
     LIMIT 1`,
  );
  if (roleMatch.rows[0]?.id) return String(roleMatch.rows[0].id);
  const anyUser = await client.query(
    `SELECT id FROM users WHERE tenant_id = current_tenant_id() AND is_active = true ORDER BY created_at LIMIT 1`,
  );
  return anyUser.rows[0]?.id ? String(anyUser.rows[0].id) : null;
}

async function insertWorkNote(
  client: AutomationDbClient,
  incidentId: string,
  content: string,
  preferredAuthorId?: string,
): Promise<void> {
  const authorId = await resolveJournalAuthorId(client, preferredAuthorId);
  if (!authorId) throw new Error('Cannot write work note: no valid author in tenant');
  await client.query(
    `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
     VALUES (current_tenant_id(), $1::uuid, $2::uuid, 'work_note', $3)`,
    [incidentId, authorId, content],
  );
}

async function executeTicket(
  state: AutomationTicketActionState,
  ctx: Record<string, unknown>,
  params: { client?: AutomationDbClient; request: Record<string, unknown> },
): Promise<NativeActionResult> {
  if (!params.client) {
    return { ok: false, message: 'action.ticket requires a database client' };
  }
  const entity = state.entity === 'request' ? 'request' : 'incident';
  const operation = state.operation || 'work_note';
  const fields = (interpolateUnknown(state.fields || {}, ctx) || {}) as Record<string, unknown>;
  const requestId = asString(params.request.id);
  const requesterId = asString(params.request.requester_id);

  if (entity === 'request') {
    if (!isUuid(requestId)) {
      return { ok: false, message: 'action.ticket on request requires a real request UUID' };
    }
    if (operation === 'close') {
      const status = asString(fields.status) === 'cancelled' ? 'cancelled' : 'fulfilled';
      await params.client.query(
        `UPDATE requests SET status = $1, updated_at = now() WHERE id = $2::uuid`,
        [status, requestId],
      );
      return { ok: true, message: `Request marked ${status}`, result: { entity, operation, status } };
    }
    if (operation === 'update') {
      const notes = asString(fields.notes);
      if (notes) {
        await params.client.query(
          `UPDATE requests SET notes = COALESCE(notes, '') || E'\n' || $1, updated_at = now() WHERE id = $2::uuid`,
          [notes, requestId],
        );
      }
      return { ok: true, message: 'Request updated', result: { entity, operation } };
    }
    return { ok: false, message: `Unsupported request ticket operation "${operation}"` };
  }

  if (operation === 'create') {
    const title = asString(fields.title) || `Catalog automation for ${asString(params.request.number) || requestId || 'request'}`;
    const description = asString(fields.description) || null;
    const impact = ['low', 'medium', 'high'].includes(asString(fields.impact)) ? asString(fields.impact) : 'medium';
    const urgency = ['low', 'medium', 'high'].includes(asString(fields.urgency)) ? asString(fields.urgency) : 'medium';
    const priorityResult = await params.client.query(
      'SELECT calculate_priority($1, $2) AS priority',
      [impact, urgency],
    );
    const priority = Number(priorityResult.rows[0]?.priority || 3);
    const seqResult = await params.client.query("SELECT nextval('incident_number_seq')");
    const number = `INC${String(seqResult.rows[0]?.nextval ?? 0).padStart(7, '0')}`;
    const slaHoursMap: Record<number, number> = { 1: 4, 2: 8, 3: 24, 4: 48, 5: 72 };
    const slaDueAt = new Date();
    slaDueAt.setHours(slaDueAt.getHours() + (slaHoursMap[priority] || 24));
    const groupId = asString(fields.assignment_group_id);
    const callerId = isUuid(requesterId) ? requesterId : null;
    const linkedRequestId = isUuid(requestId) ? requestId : null;
    const inserted = await params.client.query(
      `INSERT INTO incidents (
         tenant_id, number, request_id, title, description,
         status, impact, urgency, priority,
         assigned_to, assignment_group_id, caller_id, sla_due_at
       ) VALUES (
         current_tenant_id(), $1, $2::uuid, $3, $4,
         'new', $5, $6, $7,
         NULL, $8::uuid, $9::uuid, $10
       ) RETURNING id, number`,
      [
        number,
        linkedRequestId,
        title,
        description,
        impact,
        urgency,
        priority,
        isUuid(groupId) ? groupId : null,
        callerId,
        slaDueAt.toISOString(),
      ],
    );
    const incident = inserted.rows[0] || {};
    return {
      ok: true,
      message: `Incident ${String(incident.number || number)} created`,
      result: { entity, operation, id: incident.id, number: incident.number || number },
    };
  }

  let incidentId = asString(fields.incident_id || fields.id);
  if (!isUuid(incidentId) && isUuid(requestId)) {
    const latest = await params.client.query(
      `SELECT id FROM incidents WHERE request_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
      [requestId],
    );
    incidentId = asString(latest.rows[0]?.id);
  }
  if (!isUuid(incidentId)) {
    return { ok: false, message: 'Incident ticket action requires fields.incident_id (or a request-linked incident)' };
  }

  if (operation === 'work_note') {
    const note = asString(fields.work_note || fields.notes || fields.content);
    if (!note) return { ok: false, message: 'work_note requires fields.work_note' };
    await insertWorkNote(params.client, incidentId, note, requesterId || undefined);
    return { ok: true, message: 'Work note added', result: { entity, operation, incidentId } };
  }

  if (operation === 'update') {
    const title = asString(fields.title);
    const description = asString(fields.description);
    const status = asString(fields.status);
    await params.client.query(
      `UPDATE incidents SET
         title = COALESCE(NULLIF($2, ''), title),
         description = COALESCE(NULLIF($3, ''), description),
         status = CASE WHEN $4 = ANY(ARRAY['new','assigned','in_progress','pending','resolved','closed','cancelled'])
           THEN $4::incident_status_enum ELSE status END,
         updated_at = now()
       WHERE id = $1::uuid`,
      [incidentId, title, description, status],
    );
    return { ok: true, message: 'Incident updated', result: { entity, operation, incidentId } };
  }

  if (operation === 'close') {
    await params.client.query(
      `UPDATE incidents
       SET status = 'closed', closed_at = now(), resolution_notes = COALESCE(NULLIF($2, ''), resolution_notes), updated_at = now()
       WHERE id = $1::uuid`,
      [incidentId, asString(fields.resolution_notes || fields.work_note)],
    );
    return { ok: true, message: 'Incident closed', result: { entity, operation, incidentId } };
  }

  return { ok: false, message: `Unsupported incident ticket operation "${operation}"` };
}

async function executeAssign(
  state: AutomationAssignActionState,
  ctx: Record<string, unknown>,
  params: {
    client?: AutomationDbClient;
    request: Record<string, unknown>;
    requestTaskId?: string;
  },
): Promise<NativeActionResult> {
  if (!params.client) {
    return { ok: false, message: 'action.assign requires a database client' };
  }
  const target = state.target === 'user' ? 'user' : 'group';
  const assignee = interpolateString(state.assigneeTemplate || '', ctx);
  const groupId = interpolateString(state.groupIdTemplate || '', ctx);
  const requestId = asString(params.request.id);
  const taskId = params.requestTaskId && isUuid(params.requestTaskId) ? params.requestTaskId : '';

  if (target === 'user') {
    if (!isUuid(assignee)) return { ok: false, message: 'action.assign user target requires a user UUID in assigneeTemplate' };
    const user = await params.client.query(
      `SELECT id FROM users WHERE id = $1::uuid AND tenant_id = current_tenant_id() AND is_active = true`,
      [assignee],
    );
    if (!user.rows[0]) return { ok: false, message: `Unknown assignee user ${assignee}` };
  } else {
    if (!isUuid(groupId)) return { ok: false, message: 'action.assign group target requires a group UUID in groupIdTemplate' };
    const group = await params.client.query(
      `SELECT id FROM assignment_groups WHERE id = $1::uuid AND tenant_id = current_tenant_id()`,
      [groupId],
    );
    if (!group.rows[0]) return { ok: false, message: `Unknown assignment group ${groupId}` };
  }

  if (!taskId) {
    return { ok: false, message: 'action.assign requires the current request task id (not available in this Play context)' };
  }
  if (isUuid(requestId)) {
    await params.client.query(
      `UPDATE request_tasks
       SET assigned_to = CASE WHEN $3 = 'user' THEN $1::uuid ELSE assigned_to END,
           assigned_group_id = CASE WHEN $3 = 'group' THEN $2::uuid ELSE assigned_group_id END
       WHERE id = $4::uuid AND request_id = $5::uuid`,
      [isUuid(assignee) ? assignee : null, isUuid(groupId) ? groupId : null, target, taskId, requestId],
    );
  } else {
    await params.client.query(
      `UPDATE request_tasks
       SET assigned_to = CASE WHEN $3 = 'user' THEN $1::uuid ELSE assigned_to END,
           assigned_group_id = CASE WHEN $3 = 'group' THEN $2::uuid ELSE assigned_group_id END
       WHERE id = $4::uuid`,
      [isUuid(assignee) ? assignee : null, isUuid(groupId) ? groupId : null, target, taskId],
    );
  }

  return {
    ok: true,
    message: target === 'user' ? `Assigned task to user ${assignee}` : `Assigned task to group ${groupId}`,
    result: { target, assignee: target === 'user' ? assignee : null, groupId: target === 'group' ? groupId : null, requestTaskId: taskId },
  };
}

function executeScript(state: AutomationScriptActionState, ctx: Record<string, unknown>): NativeActionResult {
  if ((state.runtime || 'js') !== 'js') {
    return { ok: false, message: `Unsupported script runtime "${state.runtime}"` };
  }
  const code = state.code || '';
  try {
    const wrapped = `"use strict";\nresult = (function () {\n${code}\n})();`;
    const script = new vm.Script(wrapped, { filename: 'catalog-automation-script.js' });
    const sandbox = {
      request: ctx.request ?? {},
      state: ctx.state ?? {},
      response: ctx.response ?? {},
      result: undefined as unknown,
      console: { log() {}, warn() {}, error() {}, info() {} },
    };
    script.runInContext(vm.createContext(sandbox), { timeout: SCRIPT_TIMEOUT_MS });
    return { ok: true, message: 'Script completed', result: sandbox.result };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function executeNativeLibraryState(params: {
  state: AutomationState;
  ctx: Record<string, unknown>;
  request: Record<string, unknown>;
  client?: AutomationDbClient;
  requestId?: string;
  requestTaskId?: string;
  sendEmail?: AutomationSendEmail;
  callDepth?: number;
  runSubgraph?: (cfg: AutomationConfig, request: Record<string, unknown>) => Promise<NativeActionResult>;
}): Promise<NativeActionResult | null> {
  const { state, ctx } = params;
  if (state.type === 'action.notification') return executeNotification(state, ctx, params);
  if (state.type === 'action.ticket') return executeTicket(state, ctx, params);
  if (state.type === 'action.assign') return executeAssign(state, ctx, params);
  if (state.type === 'action.script') return executeScript(state, ctx);
  if (state.type === 'call.workflow') return executeCallWorkflow(state, ctx, params);
  return null;
}

async function executeCallWorkflow(
  state: AutomationCallWorkflowState,
  ctx: Record<string, unknown>,
  params: {
    client?: AutomationDbClient;
    request: Record<string, unknown>;
    callDepth?: number;
    runSubgraph?: (cfg: AutomationConfig, request: Record<string, unknown>) => Promise<NativeActionResult>;
  },
): Promise<NativeActionResult> {
  if (!params.client) {
    return { ok: false, message: 'call.workflow requires a database client' };
  }
  const depth = params.callDepth ?? 0;
  if (depth >= MAX_SUBGRAPH_DEPTH) {
    return { ok: false, message: `call.workflow exceeded max depth (${MAX_SUBGRAPH_DEPTH})` };
  }
  if (!params.runSubgraph) {
    return { ok: false, message: 'call.workflow runner is not configured' };
  }

  const definitionId = interpolateString(state.definitionId || '', ctx);
  const workflowType = interpolateString(state.workflowType || '', ctx);
  const input = (interpolateUnknown(state.input || {}, ctx) || {}) as Record<string, unknown>;

  let row: Record<string, unknown> | undefined;
  if (isUuid(definitionId)) {
    const found = await params.client.query(
      `SELECT id, name, workflow_type, published_definition
       FROM workflow_definitions
       WHERE id = $1::uuid AND tenant_id = current_tenant_id() AND is_active = true`,
      [definitionId],
    );
    row = found.rows[0];
  } else if (workflowType) {
    const found = await params.client.query(
      `SELECT id, name, workflow_type, published_definition
       FROM workflow_definitions
       WHERE workflow_type = $1 AND tenant_id = current_tenant_id() AND is_active = true
       ORDER BY updated_at DESC
       LIMIT 1`,
      [workflowType],
    );
    row = found.rows[0];
  }
  if (!row) {
    return { ok: false, message: 'No active published workflow definition matched workflowType/definitionId' };
  }
  const parsed = parseAutomationConfig(row.published_definition);
  if (!parsed) {
    return { ok: false, message: `Workflow definition ${String(row.id)} has no valid published state_machine` };
  }

  const childRequest: Record<string, unknown> = {
    ...params.request,
    form_data: {
      ...((params.request.form_data as Record<string, unknown>) || {}),
      ...input,
    },
  };
  const nested = await params.runSubgraph(parsed, childRequest);
  return {
    ok: nested.ok,
    message: nested.ok ? `Sub-workflow ${String(row.name || row.id)} completed` : nested.message,
    result: { definitionId: row.id, workflowType: row.workflow_type, nested: nested.result, message: nested.message },
  };
}
