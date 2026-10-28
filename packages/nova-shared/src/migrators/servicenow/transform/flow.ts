/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  AUTOMATION_SCHEMA_VERSION,
  validateAutomationConfig,
  type AutomationApproverType,
  type AutomationConfig,
  type AutomationState,
} from '../../../automation-config';
import { UNIFIED_BUILDER_NODE_DEFAULTS } from '../../../automation-builder-defaults';
import type { SnActionType, SnGroup, SnLogicDefinition, SnUser } from '../raw-schemas';
import type { ServiceNowFlow, ServiceNowStep } from '../snapshot';
import { encodedQueryToCondition, parseEncodedQuery, parseFieldAssignments } from './encoded-query';
import { singlePillPath, translateTemplate, translateUnknown, type PillContext, type StepAlias } from './pills';
import type { NoteCollector } from './report';
import { htmlToText, normalizeKey, slugify, truncate } from './text';
import type { FieldMapping } from './variables';

export const MAX_AUTOMATION_STATES = 80;

export type FlowLookups = {
  actionTypes: Map<string, SnActionType>;
  logicDefinitions: Map<string, SnLogicDefinition>;
  groups: Map<string, SnGroup>;
  users: Map<string, SnUser>;
  /** Subflow sys_id -> Nova workflow_type. */
  subflowTypes: Map<string, string>;
};

export type ManualTaskOut = {
  name: string;
  instructions: string;
  assignedGroupName: string | null;
  /** ServiceNow step order, used to keep manual tasks in flow order. */
  order: number;
};

export type UnmappedStep = { label: string; definition: string; inputs: Record<string, unknown> };

export type FlowConversionResult = {
  config: AutomationConfig | null;
  preApproval: { approverType: 'requester_manager' | 'group'; groupName: string | null } | null;
  manualTasks: ManualTaskOut[];
  unmappedSteps: UnmappedStep[];
  scriptSteps: number;
};

type StepClass =
  | 'if' | 'elseif' | 'else' | 'foreach' | 'parallel' | 'container' | 'end' | 'setvars' | 'wait'
  | 'subflow_outputs' | 'unsupported_logic'
  | 'approval' | 'catalog_task' | 'create_record' | 'update_record' | 'lookup' | 'email' | 'notification'
  | 'log' | 'worknote' | 'rest' | 'script' | 'wait_condition' | 'delete_record' | 'custom'
  | 'subflow';

type FlowNode = {
  step: ServiceNowStep;
  cls: StepClass;
  defName: string;
  label: string;
  stateId: string;
  children: FlowNode[];
};

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

function pick(values: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = values[k];
    if (v !== undefined && v !== null && str(v) !== '') return str(v);
  }
  return '';
}

function publicInputs(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) if (!k.startsWith('__')) out[k] = v;
  return out;
}

function classifyLogic(def: SnLogicDefinition | undefined): StepClass {
  const keys = [normalizeKey(def?.type ?? ''), normalizeKey(def?.name ?? '')].filter(Boolean);
  const test = (re: RegExp) => keys.some((k) => re.test(k));
  if (test(/^else_?if$/)) return 'elseif';
  if (test(/^if$/)) return 'if';
  if (test(/^else$/)) return 'else';
  if (test(/for_?each/)) return 'foreach';
  if (test(/parallel/)) return 'parallel';
  if (test(/^(do_the_following|do_following|try|catch|try_catch)$/)) return 'container';
  if (test(/^end(_flow)?$/)) return 'end';
  if (test(/set_?flow_?variables/)) return 'setvars';
  if (test(/wait_for_a?_?duration|^wait$/)) return 'wait';
  if (test(/assign_?subflow_?outputs/)) return 'subflow_outputs';
  return 'unsupported_logic';
}

function classifyAction(def: SnActionType | undefined, values: Record<string, unknown>): StepClass {
  const keys = [normalizeKey(def?.internal_name ?? ''), normalizeKey(def?.name ?? '')].filter(Boolean);
  const test = (re: RegExp) => keys.some((k) => re.test(k));
  const table = pick(values, 'table_name', 'table').toLowerCase();
  if (test(/ask_for_approval|^approval$|request_approval/)) return 'approval';
  if (test(/create_catalog_task/) || (test(/create_(record|task)/) && table === 'sc_task')) return 'catalog_task';
  if (test(/create_or_update_record|create_record/)) return 'create_record';
  if (test(/update_(multiple_)?records?/)) return 'update_record';
  if (test(/look_?up_records?/)) return 'lookup';
  if (test(/delete_record/)) return 'delete_record';
  if (test(/send_email/)) return 'email';
  if (test(/send_(notification|sms)/)) return 'notification';
  if (test(/^log$|log_message/)) return 'log';
  if (test(/add_work_?note|add_comment|add_worknote/)) return 'worknote';
  if (test(/wait_for_condition/)) return 'wait_condition';
  if (test(/script/) || typeof values.script === 'string') return 'script';
  if (test(/rest|http/) || ['rest_endpoint', 'base_url', 'resource_path', 'endpoint'].some((k) => k in values)) return 'rest';
  return 'custom';
}

function buildTree(flow: ServiceNowFlow, lookups: FlowLookups): FlowNode[] {
  const nodes = flow.steps.map((step): FlowNode => {
    let cls: StepClass;
    let defName: string;
    if (step.kind === 'subflow') {
      cls = 'subflow';
      defName = 'Subflow';
    } else if (step.kind === 'logic') {
      const def = lookups.logicDefinitions.get(step.definitionId);
      cls = classifyLogic(def);
      defName = def?.name || def?.type || 'Flow Logic';
    } else {
      const def = lookups.actionTypes.get(step.definitionId);
      cls = classifyAction(def, step.values);
      defName = def?.name || def?.internal_name || 'Action';
    }
    const label = `${step.order}. ${defName}${step.comment ? ` (${truncate(step.comment, 60)})` : ''}`;
    return { step, cls, defName, label, stateId: '', children: [] };
  });
  const byUi = new Map(nodes.map((n) => [n.step.uiId, n]));
  const roots: FlowNode[] = [];
  for (const n of nodes) {
    const parent = n.step.parentUiId ? byUi.get(n.step.parentUiId) : undefined;
    if (parent && parent !== n) parent.children.push(n);
    else roots.push(n);
  }
  const sortRec = (list: FlowNode[]) => {
    list.sort((a, b) => a.step.order - b.step.order);
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function walk(nodes: FlowNode[], fn: (n: FlowNode, inParallel: boolean) => void, inParallel = false): void {
  for (const n of nodes) {
    fn(n, inParallel);
    walk(n.children, fn, inParallel || n.cls === 'parallel');
  }
}

function aliasKind(cls: StepClass): StepAlias['kind'] {
  if (cls === 'approval') return 'approval';
  if (cls === 'foreach') return 'loop';
  if (cls === 'subflow') return 'subflow';
  return 'action';
}

function parseDurationSeconds(raw: string): number {
  const s = raw.trim();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (m) {
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
    return Math.round(ms / 1000);
  }
  return 0;
}

const INCIDENT_IMPACT: Record<string, string> = { '1': 'high', '2': 'medium', '3': 'low' };
const INCIDENT_STATE: Record<string, string> = {
  '1': 'new', '2': 'in_progress', '3': 'pending', '6': 'resolved', '7': 'closed', '8': 'cancelled',
};

export function convertFlow(
  flow: ServiceNowFlow,
  opts: {
    lookups: FlowLookups;
    fields: Map<string, FieldMapping>;
    notes: NoteCollector;
    isSubflow: boolean;
    extractPreApproval: boolean;
  },
): FlowConversionResult {
  const { lookups, notes } = opts;
  const roots = buildTree(flow, lookups);
  const aliases = new Map<string, StepAlias>();
  const ctx: PillContext = { fields: opts.fields, aliases, isSubflow: opts.isSubflow, notes };
  const states: AutomationState[] = [];
  const manualTasks: ManualTaskOut[] = [];
  const unmappedSteps: UnmappedStep[] = [];
  let scriptSteps = 0;
  let preApproval: FlowConversionResult['preApproval'] = null;

  // Assign stable state ids and pill aliases in flow order before compiling back to front.
  const usedIds = new Set<string>(['end_success']);
  const perDefCount = new Map<string, number>();
  walk(roots, (n, inParallel) => {
    const base = slugify(n.defName);
    let id = base;
    let i = 1;
    while (usedIds.has(id)) id = `${base}_${++i}`;
    usedIds.add(id);
    n.stateId = id;
    const defKey = normalizeKey(n.defName);
    const count = (perDefCount.get(defKey) ?? 0) + 1;
    perDefCount.set(defKey, count);
    const alias: StepAlias = { stateId: id, kind: aliasKind(n.cls) };
    for (const key of [n.step.uiId, n.step.sysId, `${defKey}_${count}`]) {
      if (key) aliases.set(key.toLowerCase(), alias);
    }
    if (n.cls === 'approval' && inParallel) {
      notes.warn('approval_in_parallel', 'Approvals inside parallel branches are not supported at runtime.', n.label);
    }
    if (n.cls === 'approval' && opts.isSubflow) {
      notes.warn('approval_in_subflow', 'Approvals inside subflows fail at runtime; move the approval into the calling flow.', n.label);
    }
  });

  const addState = (s: AutomationState) => states.push(s);

  const placeholder = (n: FlowNode, reason: string): void => {
    notes.warn('step_placeholder', `${reason} It becomes a manual fulfillment task after the automation.`, n.label);
    const inputs = publicInputs(n.step.values);
    unmappedSteps.push({ label: n.label, definition: n.defName, inputs });
    manualTasks.push({
      name: truncate(`Manual step: ${n.defName}`, 255),
      instructions: truncate(
        `Migrated from ServiceNow flow "${flow.name}" step ${n.label}. ${reason}\n\nOriginal inputs:\n${JSON.stringify(inputs, null, 2)}`,
        4000,
      ),
      assignedGroupName: null,
      order: n.step.order,
    });
  };

  const resolveGroupName = (raw: string): string | null => {
    const id = raw.trim();
    if (!id) return null;
    return lookups.groups.get(id)?.name ?? null;
  };

  const resolveApprover = (n: FlowNode): { type: AutomationApproverType; template: string } => {
    const values = n.step.values;
    const rules = pick(values, 'rules', 'approval_conditions', 'approval_rules', 'approvers', 'approver');
    const groups = [...rules.matchAll(/G\[([0-9a-f]{32})/g)].map((m) => m[1]);
    const users = [...rules.matchAll(/U\[([0-9a-f]{32})/g)].map((m) => m[1]);
    if (groups.length + users.length > 1) {
      notes.warn('approval_multiple', 'Multiple approvers/rules found; only the first is migrated.', n.label);
    }
    if (/manager/i.test(rules) && groups.length === 0 && users.length === 0) {
      return { type: 'requester_manager', template: '' };
    }
    if (groups[0]) {
      const name = resolveGroupName(groups[0]);
      if (!name) notes.warn('approval_group_unresolved', `Approval group ${groups[0]} not found; set the approver after import.`, n.label);
      return { type: 'group', template: name ?? groups[0] };
    }
    if (users[0]) {
      const u = lookups.users.get(users[0]);
      if (!u) notes.warn('approval_user_unresolved', `Approval user ${users[0]} not found; set the approver after import.`, n.label);
      return { type: 'user', template: u?.email || u?.user_name || users[0] };
    }
    const pill = /\{\{[^}]+\}\}/.exec(rules);
    if (pill) {
      const path = singlePillPath(pill[0], ctx);
      if (path) return { type: 'user', template: `{{${path}}}` };
    }
    notes.warn('approval_rules_unparsed', 'Approval rules could not be parsed; defaulting to the requester\'s manager.', n.label);
    return { type: 'requester_manager', template: '' };
  };

  const fieldAssignments = (n: FlowNode): Record<string, string> => {
    const raw = n.step.values.values ?? n.step.values.field_values ?? n.step.values.fields;
    const out: Record<string, string> = {};
    if (typeof raw === 'string') {
      for (const { field, value } of parseFieldAssignments(raw)) out[field] = translateTemplate(value, ctx);
    } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = translateTemplate(str(v), ctx);
    }
    return out;
  };

  const compileAction = (n: FlowNode, next: string): string => {
    const values = n.step.values;
    const id = n.stateId;
    const success = [{ to: next, when: 'success' }];
    const table = pick(values, 'table_name', 'table').toLowerCase();
    switch (n.cls) {
      case 'approval': {
        const approver = resolveApprover(n);
        const groupResolved = approver.type === 'group' &&
          [...lookups.groups.values()].some((g) => g.name === approver.template);
        if (opts.extractPreApproval && roots[0] === n && (approver.type === 'requester_manager' || groupResolved)) {
          preApproval = {
            approverType: approver.type === 'group' ? 'group' : 'requester_manager',
            groupName: approver.type === 'group' ? approver.template : null,
          };
          notes.info('pre_approval', 'Leading approval became a catalog approval task before the automation.', n.label);
          addState({ id, type: 'variables.set', assignments: { outcome: 'approved' }, transitions: [{ to: next }] });
          return id;
        }
        addState({
          id,
          type: 'action.approval',
          approverType: approver.type,
          ...(approver.template ? { approverTemplate: approver.template } : {}),
          name: truncate(n.step.comment || `${flow.name}: approval`, 200),
          instructions: 'Migrated from ServiceNow. Approve or reject this request.',
          transitions: [{ to: next, when: 'approved' }, { to: next, when: 'rejected' }],
        });
        return id;
      }
      case 'catalog_task': {
        const groupId = pick(values, 'assignment_group');
        const groupName = resolveGroupName(groupId);
        if (groupId && !groupName) notes.warn('task_group_unresolved', `Assignment group ${groupId} not found.`, n.label);
        manualTasks.push({
          name: truncate(htmlToText(translateTemplate(pick(values, 'short_description', 'name'), ctx)) || 'Catalog task', 255),
          instructions: truncate(htmlToText(translateTemplate(pick(values, 'description', 'instructions'), ctx)), 4000),
          assignedGroupName: groupName,
          order: n.step.order,
        });
        notes.info('catalog_task', 'Catalog task becomes a manual fulfillment task that runs after the automation.', n.label);
        return next;
      }
      case 'create_record': {
        const fields = fieldAssignments(n);
        if (table === 'incident') {
          const ticketFields: Record<string, unknown> = {
            title: fields.short_description || `Request {{request.number}}`,
            ...(fields.description ? { description: fields.description } : {}),
            ...(INCIDENT_IMPACT[fields.impact] ? { impact: INCIDENT_IMPACT[fields.impact] } : {}),
            ...(INCIDENT_IMPACT[fields.urgency] ? { urgency: INCIDENT_IMPACT[fields.urgency] } : {}),
          };
          addState({ id, type: 'action.ticket', entity: 'incident', operation: 'create', fields: ticketFields, transitions: success });
          return id;
        }
        if (table.startsWith('cmdb_ci')) {
          const { name, ...attributes } = fields;
          addState({
            id,
            type: 'action.ci.create',
            url: UNIFIED_BUILDER_NODE_DEFAULTS['action.ci.create'].url ?? '',
            method: 'POST',
            className: table.replace(/^cmdb_ci_?/, '') || 'ci',
            name: name || '{{request.number}}',
            attributes,
            transitions: success,
          });
          notes.info('ci_class', `CMDB class ${table} mapped to Nova class "${table.replace(/^cmdb_ci_?/, '') || 'ci'}"; verify it exists.`, n.label);
          return id;
        }
        placeholder(n, `Create Record on ${table || 'an unknown table'} has no Nova equivalent.`);
        return next;
      }
      case 'update_record': {
        const fields = fieldAssignments(n);
        if (table === 'incident') {
          addState({
            id,
            type: 'action.ticket',
            entity: 'incident',
            operation: 'update',
            fields: {
              ...(fields.short_description ? { title: fields.short_description } : {}),
              ...(fields.description ? { description: fields.description } : {}),
              ...(INCIDENT_STATE[fields.state] ? { status: INCIDENT_STATE[fields.state] } : {}),
            },
            transitions: success,
          });
          notes.info('incident_target', 'Incident updates target the incident linked to the request.', n.label);
          return id;
        }
        if (table === 'sc_req_item' || table === 'sc_request') {
          const notesText = fields.work_notes || fields.comments;
          const closing = ['3', '4', '7', 'closed_complete', 'complete'].includes(fields.state ?? '') || fields.stage === 'complete';
          if (closing) {
            addState({ id, type: 'action.ticket', entity: 'request', operation: 'close', fields: {}, transitions: success });
            return id;
          }
          if (notesText) {
            addState({ id, type: 'action.ticket', entity: 'request', operation: 'update', fields: { notes: notesText }, transitions: success });
            return id;
          }
          notes.info('request_update_skipped', 'Request field updates have no Nova equivalent and were skipped.', n.label);
          return next;
        }
        placeholder(n, `Update Record on ${table || 'an unknown table'} has no Nova equivalent.`);
        return next;
      }
      case 'lookup': {
        if (table.startsWith('cmdb_ci')) {
          const attributes: Record<string, unknown> = {};
          const cond = pick(values, 'conditions', 'condition', 'query');
          for (const group of parseEncodedQuery(cond).slice(0, 1)) {
            for (const ors of group) {
              const t = ors[0];
              if (ors.length === 1 && t.op === '=') attributes[t.field] = translateTemplate(t.value, ctx);
            }
          }
          addState({
            id,
            type: 'action.ci.lookup',
            url: UNIFIED_BUILDER_NODE_DEFAULTS['action.ci.lookup'].url ?? '',
            method: 'POST',
            className: table.replace(/^cmdb_ci_?/, '') || undefined,
            attributes,
            transitions: success,
          });
          return id;
        }
        notes.warn('lookup_unsupported', `Look Up Record on ${table || 'an unknown table'} is not supported; pills that use its result will be empty.`, n.label);
        return next;
      }
      case 'email':
      case 'notification': {
        const to = pick(values, 'to', 'recipients', 'users', 'recipient');
        let recipientType = 'requester';
        const toPath = singlePillPath(to, ctx);
        if (toPath === 'request.requested_for') recipientType = 'requested_for';
        else if (toPath === 'request.requester_id') recipientType = 'requester';
        else if (toPath) recipientType = `{{${toPath}}}`;
        else if (/^[^@\s]+@[^@\s]+$/.test(to)) {
          recipientType = to;
          notes.info('recipient_email', `Recipient ${to} must exist as a Nova user to receive the email.`, n.label);
        }
        else if (/^[0-9a-f]{32}$/.test(to) && lookups.users.get(to)?.email) recipientType = lookups.users.get(to)!.email;
        else if (to) notes.warn('recipient_unresolved', `Recipient "${truncate(to, 80)}" could not be mapped; sending to the requester.`, n.label);
        const subject = pick(values, 'subject', 'title');
        const body = pick(values, 'body', 'message', 'html');
        if (n.cls === 'notification' && !subject) {
          notes.warn('notification_template', 'ServiceNow notification records are not migrated; a generic email is sent instead.', n.label);
        }
        addState({
          id,
          type: 'action.notification',
          channel: 'email',
          recipientType,
          titleTemplate: translateTemplate(subject || 'Update on {{request.number}}', ctx),
          bodyTemplate: translateTemplate(htmlToText(body) || 'Your request {{request.number}} was updated.', ctx),
          transitions: success,
        });
        return id;
      }
      case 'log':
        notes.info('log_skipped', 'Log step skipped.', n.label);
        return next;
      case 'worknote': {
        const text = translateTemplate(pick(values, 'work_note', 'work_notes', 'comment', 'comments', 'note'), ctx);
        addState({ id, type: 'action.ticket', entity: 'request', operation: 'update', fields: { notes: text }, transitions: success });
        return id;
      }
      case 'rest': {
        const base = pick(values, 'base_url', 'rest_endpoint', 'endpoint', 'url');
        const path = pick(values, 'resource_path', 'path');
        const url = translateTemplate(`${base.replace(/\/+$/, '')}${path ? `/${path.replace(/^\/+/, '')}` : ''}`, ctx);
        if (!url) {
          placeholder(n, 'REST step without a resolvable endpoint (likely a connection alias).');
          return next;
        }
        const headersRaw = values.headers ?? values.request_headers;
        const headers: Record<string, string> = {};
        if (headersRaw && typeof headersRaw === 'object' && !Array.isArray(headersRaw)) {
          for (const [k, v] of Object.entries(headersRaw as Record<string, unknown>)) headers[k] = translateTemplate(str(v), ctx);
        }
        const body = pick(values, 'request_body', 'body');
        addState({
          id,
          type: 'action.rest',
          method: (pick(values, 'http_method', 'method') || 'GET').toUpperCase(),
          url,
          ...(Object.keys(headers).length ? { headers } : {}),
          ...(body ? { body: translateTemplate(body, ctx) } : {}),
          transitions: success,
        });
        notes.warn('rest_credentials', 'REST authentication is not migrated; store a credential and reference it with {{cred.<slug>}}.', n.label);
        return id;
      }
      case 'script': {
        scriptSteps += 1;
        const original = str(n.step.values.script || JSON.stringify(publicInputs(n.step.values))).replace(/\*\//g, '* /');
        addState({
          id,
          type: 'action.script',
          runtime: 'js',
          code: `/* Migrated from ServiceNow (${n.label}). Port this logic: GlideRecord and other ServiceNow APIs are unavailable.\n${original}\n*/\nthrow new Error('ServiceNow script step "${n.stateId}" has not been ported yet');\n`,
          transitions: success,
        });
        notes.warn('script_review', 'Script step needs manual porting; it fails until reviewed.', n.label);
        return id;
      }
      case 'wait_condition':
        placeholder(n, 'Wait For Condition is not supported.');
        return next;
      case 'delete_record':
        placeholder(n, 'Delete Record is not supported.');
        return next;
      default:
        placeholder(n, `Action "${n.defName}" (custom or spoke action) has no Nova equivalent.`);
        return next;
    }
  };

  const compileChain = (chain: FlowNode[], next: string): string => {
    let falseTarget = next;
    let conds = chain;
    const last = chain[chain.length - 1];
    if (last.cls === 'else') {
      falseTarget = compileSeq(last.children, next);
      conds = chain.slice(0, -1);
    }
    for (let i = conds.length - 1; i >= 0; i -= 1) {
      const n = conds[i];
      const expression = encodedQueryToCondition(pick(n.step.values, 'condition', 'conditions', 'condition_string'), ctx);
      const trueEntry = compileSeq(n.children, next);
      addState({
        id: n.stateId,
        type: 'decision.advanced',
        expression,
        transitions: [{ to: trueEntry, when: 'true' }, { to: falseTarget, when: 'false' }],
      });
      falseTarget = n.stateId;
    }
    return falseTarget;
  };

  const compileNode = (n: FlowNode, next: string): string => {
    const values = n.step.values;
    switch (n.cls) {
      case 'foreach': {
        const raw = pick(values, 'items', 'list', 'input', 'records', 'array');
        if (!raw) notes.warn('foreach_items', 'For Each without a recognizable items input.', n.label);
        const body = compileSeq(n.children, n.stateId);
        addState({
          id: n.stateId,
          type: 'loop.foreach',
          itemsExpr: translateTemplate(raw || '[]', ctx),
          transitions: [{ to: body, when: 'item' }, { to: next, when: 'done' }],
        });
        return n.stateId;
      }
      case 'parallel': {
        const joinId = `${n.stateId}_join`;
        const branches = n.children.map((c) => (c.cls === 'container' ? c.children : [c]));
        const entries = [...new Set(branches.map((b) => compileSeq(b, joinId)))];
        if (entries.length === 0) return next;
        addState({ id: joinId, type: 'parallel.join', transitions: [{ to: next }] });
        addState({ id: n.stateId, type: 'parallel.fork', joinId, transitions: entries.map((to) => ({ to, when: 'branch' })) });
        return n.stateId;
      }
      case 'container':
        if (/catch/i.test(n.defName)) {
          notes.warn('catch_block', 'Catch blocks are not supported; their steps run unconditionally.', n.label);
        }
        return compileSeq(n.children, next);
      case 'end':
        addState({ id: n.stateId, type: 'end', result: 'success' });
        return n.stateId;
      case 'setvars': {
        const assignments: Record<string, string> = {};
        const source = Array.isArray(values.variables)
          ? Object.fromEntries((values.variables as Array<Record<string, unknown>>).map((v) => [str(v.name), v.value]))
          : publicInputs(values);
        for (const [k, v] of Object.entries(source)) {
          const key = k.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');
          if (key) assignments[key] = translateTemplate(str(v), ctx);
        }
        if (Object.keys(assignments).length === 0) return next;
        addState({ id: n.stateId, type: 'variables.set', assignments, transitions: [{ to: next }] });
        return n.stateId;
      }
      case 'wait': {
        let seconds = parseDurationSeconds(pick(values, 'duration', 'wait_duration', 'seconds'));
        if (seconds <= 0) {
          notes.warn('wait_unparsed', 'Wait duration could not be parsed; step skipped.', n.label);
          return next;
        }
        if (seconds > 3600) {
          notes.warn('wait_capped', `Wait of ${seconds}s capped to 3600s (Nova delay limit).`, n.label);
          seconds = 3600;
        }
        addState({ id: n.stateId, type: 'delay', delaySeconds: seconds, transitions: [{ to: next }] });
        return n.stateId;
      }
      case 'subflow_outputs':
        notes.info('subflow_outputs', 'Assign Subflow Outputs is not needed in Nova and was skipped.', n.label);
        return compileSeq(n.children, next);
      case 'unsupported_logic':
        notes.warn('logic_unsupported', `Flow logic "${n.defName}" is not supported; its inner steps run once in sequence.`, n.label);
        return compileSeq(n.children, next);
      case 'elseif':
      case 'else':
        notes.warn('orphan_else', 'Else branch without a preceding If; its steps run unconditionally.', n.label);
        return compileSeq(n.children, next);
      case 'subflow': {
        const workflowType = lookups.subflowTypes.get(n.step.subflowId);
        if (!workflowType) {
          placeholder(n, `Subflow ${n.step.subflowId} was not extracted.`);
          return next;
        }
        const input = translateUnknown(publicInputs(values), ctx) as Record<string, unknown>;
        addState({ id: n.stateId, type: 'call.workflow', workflowType, input, transitions: [{ to: next, when: 'success' }] });
        return n.stateId;
      }
      default:
        return compileAction(n, next);
    }
  };

  function compileSeq(nodes: FlowNode[], next: string): string {
    const units: Array<FlowNode | FlowNode[]> = [];
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      if (n.cls === 'if') {
        const chain = [n];
        while (i + 1 < nodes.length && (nodes[i + 1].cls === 'elseif' || nodes[i + 1].cls === 'else')) {
          chain.push(nodes[++i]);
          if (chain[chain.length - 1].cls === 'else') break;
        }
        units.push(chain);
      } else {
        units.push(n);
      }
    }
    let entry = next;
    for (let i = units.length - 1; i >= 0; i -= 1) {
      const u = units[i];
      entry = Array.isArray(u) ? compileChain(u, entry) : compileNode(u, entry);
    }
    return entry;
  }

  const startAt = compileSeq(roots, 'end_success');
  addState({ id: 'end_success', type: 'end', result: 'success' });

  const meaningful = states.filter((s) => s.id !== 'end_success');
  let config: AutomationConfig | null = null;
  if (meaningful.length > 0) {
    const candidate: AutomationConfig = {
      kind: 'state_machine',
      schemaVersion: AUTOMATION_SCHEMA_VERSION,
      startAt,
      states,
    };
    if (states.length > MAX_AUTOMATION_STATES) {
      notes.error('flow_too_large', `Converted flow has ${states.length} states (Nova limit ${MAX_AUTOMATION_STATES}); split it into subflows.`);
    } else {
      const errors = validateAutomationConfig(candidate);
      if (errors.length > 0) {
        for (const e of errors.slice(0, 5)) notes.error('automation_invalid', e);
      } else {
        config = candidate;
      }
    }
  }

  manualTasks.sort((a, b) => a.order - b.order);
  unmappedSteps.reverse();
  return { config, preApproval, manualTasks, unmappedSteps, scriptSteps };
}
