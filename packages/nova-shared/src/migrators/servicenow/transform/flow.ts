/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  AUTOMATION_SCHEMA_VERSION,
  validateAutomationConfig,
  type AutomationApproverType,
  type AutomationConfig,
  type AutomationState,
} from '../../../automation-config';
import { UNIFIED_BUILDER_NODE_DEFAULTS } from '../../../automation-builder-defaults';
import type { ServiceNowFlow } from '../snapshot';
import { encodedQueryToCondition, parseEncodedQuery, parseFieldAssignments } from './encoded-query';
import { singlePillPath, translateTemplate, translateUnknown, type PillContext, type StepAlias } from './pills';
import type { NoteCollector } from './report';
import { htmlToText, normalizeKey, slugify, truncate } from './text';
import type { FieldMapping } from './variables';
import {
  APPROVAL_REJECTED_VAR,
  MAX_AUTOMATION_STATES,
  type FlowConversionResult,
  type FlowLookups,
  type UnmappedStep,
} from './flow-types';
import { subflowOutputVar } from './flow-helpers';
import { inlineSubflows, simplifyInlinedSubflows } from './inline-subflow';
import {
  parseDurationSeconds,
  pick,
  publicInputs,
  referenceValue,
  str,
  triggerAliasesFor,
} from './step-values';
import { aliasKind, buildTree, type FlowNode, walk } from './tree';

export {
  APPROVAL_REJECTED_VAR,
  MAX_AUTOMATION_STATES,
  MAX_SUBFLOW_INLINE_DEPTH,
  type FlowConversionResult,
  type FlowLookups,
  type UnmappedStep,
} from './flow-types';
export { subflowOutputVar } from './flow-helpers';
export { classifyAction, classifyLogic, type StepClass } from './classify';
export { parseDurationSeconds, pick, publicInputs, referenceValue, str } from './step-values';

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
  const calledSubflowIds = new Set<string>();
  if (flow.flowVariables.length > 0) {
    notes.info(
      'flow_variables',
      `Flow declares ${flow.flowVariables.length} flow variable(s); only values set by steps are migrated (declarations alone are not seeded into vars).`,
    );
  }
  const rootCtx: PillContext = {
    fields: opts.fields,
    aliases: new Map(),
    isSubflow: opts.isSubflow,
    notes,
    triggerAliases: triggerAliasesFor(flow.triggerName),
  };
  const roots = buildTree(flow, lookups, rootCtx);
  inlineSubflows(roots, lookups, 0, [flow.sys_id]);
  simplifyInlinedSubflows(roots);
  /** Pill scope of the step being compiled; switched while compiling inlined subflows. */
  let ctx = rootCtx;
  const states: AutomationState[] = [];
  const unmappedSteps: UnmappedStep[] = [];
  let scriptSteps = 0;
  let preApproval: FlowConversionResult['preApproval'] = null;
  /** True when some in-flow approval can reject without going straight to end_rejected. */
  let needsRejectFlag = false;

  // Assign stable state ids and pill aliases in flow order before compiling back to front.
  const usedIds = new Set<string>(['end_success', 'end_rejected', 'finish']);
  const perDefCount = new Map<PillContext, Map<string, number>>();
  walk(roots, (n, inParallel) => {
    const base = slugify(n.defName);
    let id = base;
    let i = 1;
    while (usedIds.has(id)) id = `${base}_${++i}`;
    usedIds.add(id);
    n.stateId = id;
    const counts = perDefCount.get(n.ctx) ?? new Map<string, number>();
    perDefCount.set(n.ctx, counts);
    const defKey = normalizeKey(n.defName);
    const count = (counts.get(defKey) ?? 0) + 1;
    counts.set(defKey, count);
    const alias: StepAlias = { stateId: id, kind: aliasKind(n.cls) };
    for (const key of [n.step.uiId, n.step.sysId, `${defKey}_${count}`]) {
      if (key) n.ctx.aliases.set(key.toLowerCase(), alias);
    }
    if (n.innerCtx) n.innerCtx.outputPrefix = id;
    if (n.cls === 'approval') {
      if (!n.rejectToFinish) needsRejectFlag = true; // cleared later if the only approvals are lifted to catalog tasks
      if (inParallel) {
        notes.warn('approval_in_parallel', 'Approvals inside parallel branches are not supported at runtime.', n.label);
      }
      if (opts.isSubflow && !n.ctx.subflowInputs) {
        notes.warn('approval_in_subflow', 'Approvals inside sub-workflows fail at runtime; call this subflow from a flow so it is inlined.', n.label);
      }
    }
  });

  /** Where ServiceNow "End" goes: the caller of an inlined subflow, or the end of the flow. */
  const finishId = needsRejectFlag && !opts.isSubflow ? 'finish' : 'end_success';
  let endTarget: string | null = null;

  const addState = (s: AutomationState) => states.push(s);

  const manualTask = (
    n: FlowNode,
    next: string,
    task: { name: string; instructions: string; group?: string | null; assignee?: string; wait?: boolean },
  ): string => {
    addState({
      id: n.stateId,
      type: 'action.task',
      name: truncate(task.name, 255),
      ...(task.instructions ? { instructions: truncate(task.instructions, 4000) } : {}),
      ...(task.group ? { groupTemplate: task.group } : {}),
      ...(task.assignee ? { assigneeTemplate: task.assignee } : {}),
      ...(task.wait === false ? { wait: false } : {}),
      transitions: [{ to: next, when: 'success' }],
    });
    return n.stateId;
  };

  const placeholder = (n: FlowNode, reason: string, next: string): string => {
    notes.warn('step_placeholder', `${reason} It becomes a manual task in the flow.`, n.label);
    const inputs = publicInputs(n.step.values);
    unmappedSteps.push({ label: n.label, definition: n.defName, inputs });
    return manualTask(n, next, {
      name: `Manual step: ${n.defName}`,
      instructions: `Migrated from ServiceNow flow "${n.flowName}" step ${n.label}. ${reason}\n\nOriginal inputs:\n${JSON.stringify(inputs, null, 2)}`,
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
          const isManager = approver.type === 'requester_manager';
          preApproval = {
            name: truncate(n.step.comment || n.flowName || 'Approval', 200),
            approverType: isManager ? 'requester_manager' : 'group',
            groupName: isManager ? null : approver.template,
          };
          notes.info(
            isManager ? 'manager_approval' : 'pre_approval',
            isManager
              ? 'Leading manager approval became the service item "Manager approval" setting.'
              : 'Leading approval became a catalog approval task before the automation.',
            n.label,
          );
          return next;
        }
        if (n.rejectToFinish) {
          // Gate subflows end the parent flow on reject; skip the if/assign/end scaffolding.
          addState({
            id,
            type: 'action.approval',
            approverType: approver.type,
            ...(approver.template ? { approverTemplate: approver.template } : {}),
            name: truncate(n.step.comment || n.flowName || 'Approval', 200),
            instructions: 'Migrated from ServiceNow. Approve or reject this request.',
            transitions: [{ to: next, when: 'approved' }, { to: 'end_rejected', when: 'rejected' }],
          });
          return id;
        }
        addState({
          id,
          type: 'action.approval',
          approverType: approver.type,
          ...(approver.template ? { approverTemplate: approver.template } : {}),
          name: truncate(n.step.comment || n.flowName || 'Approval', 200),
          instructions: 'Migrated from ServiceNow. Approve or reject this request.',
          transitions: [{ to: next, when: 'approved' }, { to: `${id}_rejected`, when: 'rejected' }],
        });
        addState({
          id: `${id}_rejected`,
          type: 'variables.set',
          assignments: { [APPROVAL_REJECTED_VAR]: 'true' },
          transitions: [{ to: next }],
        });
        return id;
      }
      case 'catalog_task': {
        const fields = Object.fromEntries(
          parseFieldAssignments(pick(values, 'ah_fields', 'fields')).map(({ field, value }) => [
            field,
            translateTemplate(value, ctx),
          ]),
        );
        const group = referenceValue(fields.assignment_group || pick(values, 'ah_assignment_group', 'assignment_group'));
        const groupName = (group.id && resolveGroupName(group.id)) || group.display || null;
        if (group.id && !groupName) notes.warn('task_group_unresolved', `Assignment group ${group.id} not found.`, n.label);
        const user = referenceValue(fields.assigned_to || pick(values, 'ah_assigned_to', 'assigned_to'));
        const assignee = user.id ? lookups.users.get(user.id)?.email || '' : '';
        if (user.id && !assignee) notes.warn('task_assignee_unresolved', `Assignee ${user.display || user.id} not found; the task is assigned to the group only.`, n.label);
        const waitRaw = pick(values, 'ah_wait', 'wait', 'wait_for_completion').toLowerCase();
        notes.info('catalog_task', 'Catalog task becomes a manual task inside the flow.', n.label);
        return manualTask(n, next, {
          name: htmlToText(translateTemplate(pick(values, 'ah_short_description', 'short_description', 'name') || fields.short_description || '', ctx)) || 'Catalog task',
          instructions: htmlToText(translateTemplate(fields.description || pick(values, 'ah_description', 'description', 'instructions'), ctx)),
          group: groupName,
          assignee,
          wait: !['0', 'false'].includes(waitRaw),
        });
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
        return placeholder(n, `Create Record on ${table || 'an unknown table'} has no Nova equivalent.`, next);
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
        return placeholder(n, `Update Record on ${table || 'an unknown table'} has no Nova equivalent.`, next);
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
        const to = pick(values, 'ah_to', 'to', 'recipients', 'users', 'recipient');
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
        const subject = pick(
          values,
          'ah_subject', 'subject', 'title', 'emal_subject', 'email_subject',
        );
        const body = pick(values, 'ah_body', 'body', 'message', 'html');
        if (n.cls === 'notification' && !subject) {
          notes.warn('notification_template', 'ServiceNow notification records are not migrated; a generic email is sent instead.', n.label);
        }
        addState({
          id,
          type: 'action.notification',
          channel: 'email',
          recipientType,
          titleTemplate: htmlToText(translateTemplate(subject || 'Update on {{request.number}}', ctx)),
          bodyTemplate: htmlToText(translateTemplate(body, ctx)) || 'Your request {{request.number}} was updated.',
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
          return placeholder(n, 'REST step without a resolvable endpoint (likely a connection alias).', next);
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
        return placeholder(n, 'Wait For Condition is not supported.', next);
      case 'delete_record':
        return placeholder(n, 'Delete Record is not supported.', next);
      default:
        return placeholder(n, `Action "${n.defName}" (custom or spoke action) has no Nova equivalent.`, next);
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
      ctx = n.ctx;
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
    ctx = n.ctx;
    switch (n.cls) {
      case 'inline_subflow': {
        const savedEnd = endTarget;
        endTarget = next;
        const entry = compileSeq(n.children, next);
        endTarget = savedEnd;
        return entry;
      }
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
        return endTarget ?? finishId;
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
        const duration = parseDurationSeconds(pick(values, 'duration', 'wait_duration', 'seconds'));
        if (duration.absolute) {
          notes.warn('wait_until_unsupported', 'Wait-until datetime is not supported as a delay; step skipped.', n.label);
          return next;
        }
        let seconds = duration.seconds;
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
      case 'subflow_outputs': {
        const prefix = n.ctx.outputPrefix;
        const outputs = Object.entries(publicInputs(values));
        if (!prefix || outputs.length === 0) {
          notes.info('subflow_outputs', 'Assign Subflow Outputs is not needed in Nova and was skipped.', n.label);
          return compileSeq(n.children, next);
        }
        const assignments: Record<string, string> = {};
        for (const [k, v] of outputs) assignments[subflowOutputVar(prefix, k)] = translateTemplate(str(v), ctx);
        addState({ id: n.stateId, type: 'variables.set', assignments, transitions: [{ to: compileSeq(n.children, next) }] });
        return n.stateId;
      }
      case 'unsupported_logic':
        notes.warn('logic_unsupported', `Flow logic "${n.defName}" is not supported; its inner steps run once in sequence.`, n.label);
        return compileSeq(n.children, next);
      case 'elseif':
      case 'else':
        notes.warn('orphan_else', 'Else branch without a preceding If; its steps run unconditionally.', n.label);
        return compileSeq(n.children, next);
      case 'subflow': {
        const workflowType = lookups.subflowTypes.get(n.step.subflowId);
        if (!workflowType) return placeholder(n, `Subflow ${n.step.subflowId} was not extracted.`, next);
        calledSubflowIds.add(n.step.subflowId);
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

  let startAt = compileSeq(roots, finishId);
  if (finishId === 'finish' && !states.some((s) => s.type === 'action.approval')) {
    // The only approval became the catalog pre-approval; nothing in the flow can reject.
    for (const s of states) {
      for (const t of (s as { transitions?: Array<{ to: string }> }).transitions ?? []) {
        if (t.to === 'finish') t.to = 'end_success';
      }
    }
    if (startAt === 'finish') startAt = 'end_success';
  } else if (finishId === 'finish') {
    addState({
      id: 'finish',
      type: 'decision.advanced',
      expression: { op: 'eq', left: { var: `vars.${APPROVAL_REJECTED_VAR}` }, right: 'true' },
      transitions: [{ to: 'end_rejected', when: 'true' }, { to: 'end_success', when: 'false' }],
    });
  }
  const referencesRejectEnd = finishId === 'finish' || states.some((s) =>
    ((s as { transitions?: Array<{ to: string }> }).transitions ?? []).some((t) => t.to === 'end_rejected'));
  if (referencesRejectEnd) {
    addState({ id: 'end_rejected', type: 'end', result: 'failure', onFailure: { rejectRequest: true } });
  }
  addState({ id: 'end_success', type: 'end', result: 'success' });

  const meaningful = states.filter((s) => !['end_success', 'end_rejected', 'finish'].includes(s.id));
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

  unmappedSteps.reverse();
  return { config, preApproval, unmappedSteps, scriptSteps, calledSubflowIds: [...calledSubflowIds] };
}
