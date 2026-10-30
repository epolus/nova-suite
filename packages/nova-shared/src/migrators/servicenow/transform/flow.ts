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
export const MAX_SUBFLOW_INLINE_DEPTH = 4;
/** Set when a ServiceNow approval is rejected; the flow then ends by rejecting the request. */
export const APPROVAL_REJECTED_VAR = 'sn_approval_rejected';

export type FlowLookups = {
  actionTypes: Map<string, SnActionType>;
  logicDefinitions: Map<string, SnLogicDefinition>;
  groups: Map<string, SnGroup>;
  users: Map<string, SnUser>;
  /** Subflow sys_id -> Nova workflow_type. */
  subflowTypes: Map<string, string>;
  /** Extracted flows by sys_id, used to inline subflows into their callers. */
  flows: Map<string, ServiceNowFlow>;
  /** Subflows that could not be inlined and are called as sub-workflows; filled during conversion. */
  calledSubflows: Set<string>;
};

export type UnmappedStep = { label: string; definition: string; inputs: Record<string, unknown> };

export type FlowConversionResult = {
  config: AutomationConfig | null;
  preApproval: { name: string; approverType: 'requester_manager' | 'group'; groupName: string | null } | null;
  unmappedSteps: UnmappedStep[];
  scriptSteps: number;
};

type StepClass =
  | 'if' | 'elseif' | 'else' | 'foreach' | 'parallel' | 'container' | 'end' | 'setvars' | 'wait'
  | 'subflow_outputs' | 'unsupported_logic'
  | 'approval' | 'catalog_task' | 'create_record' | 'update_record' | 'lookup' | 'email' | 'notification'
  | 'log' | 'worknote' | 'rest' | 'script' | 'wait_condition' | 'delete_record' | 'custom'
  | 'subflow' | 'inline_subflow';

type FlowNode = {
  step: ServiceNowStep;
  cls: StepClass;
  defName: string;
  label: string;
  stateId: string;
  children: FlowNode[];
  /** Name of the ServiceNow flow or subflow the step belongs to. */
  flowName: string;
  /** Pill scope of the flow this step belongs to. */
  ctx: PillContext;
  /** For inlined subflows: the pill scope of the subflow's own steps. */
  innerCtx?: PillContext;
  /**
   * Approval that replaced an "approval gate" subflow whose caller then ends on reject.
   * Rejected goes straight to the flow's reject finish instead of through if/assign/end scaffolding.
   */
  rejectToFinish?: boolean;
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

/** Reference inputs arrive as a sys_id or as `{"display":"Procurement","value":"<sys_id>"}`. */
function referenceValue(raw: string): { id: string; display: string } {
  const text = raw.trim();
  if (text.startsWith('{')) {
    try {
      const o = JSON.parse(text) as Record<string, unknown>;
      return { id: str(o.value), display: str(o.display ?? o.display_value) };
    } catch {
      // fall through
    }
  }
  return /^[0-9a-f]{32}$/.test(text) ? { id: text, display: '' } : { id: '', display: text };
}

/** Pills reference the trigger by its name, e.g. `{{Service Catalog_1.request_item}}`. */
function triggerAliasesFor(triggerName: string): Set<string> {
  const base = triggerName.replace(/\s+/g, '').toLowerCase();
  return new Set(base ? [`${base}_1`, base] : []);
}

export function subflowOutputVar(prefix: string, output: string): string {
  return `${prefix}_${output.replace(/[^A-Za-z0-9_]/g, '_')}`;
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

function buildTree(flow: ServiceNowFlow, lookups: FlowLookups, ctx: PillContext): FlowNode[] {
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
    return { step, cls, defName, label, stateId: '', children: [], flowName: flow.name, ctx };
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

/**
 * Replaces subflow calls with the subflow's own steps. Nova sub-workflows cannot pause for
 * approvals or manual tasks and only receive plain values, so ServiceNow subflows (which pass
 * records such as the requested item) run correctly only when inlined.
 */
function inlineSubflows(
  nodes: FlowNode[],
  lookups: FlowLookups,
  depth: number,
  stack: string[],
): void {
  for (const n of nodes) {
    if (n.cls === 'subflow') {
      const sub = lookups.flows.get(n.step.subflowId);
      const cyclic = stack.includes(n.step.subflowId);
      if (sub && sub.steps.length > 0 && !cyclic && depth < MAX_SUBFLOW_INLINE_DEPTH) {
        const inner: PillContext = {
          fields: n.ctx.fields,
          aliases: new Map(),
          isSubflow: true,
          notes: n.ctx.notes,
          subflowInputs: { values: publicInputs(n.step.values), parent: n.ctx },
        };
        n.cls = 'inline_subflow';
        n.defName = sub.name || 'Subflow';
        n.label = `${n.step.order}. Subflow: ${n.defName}`;
        n.innerCtx = inner;
        n.children = buildTree(sub, lookups, inner);
        inlineSubflows(n.children, lookups, depth + 1, [...stack, n.step.subflowId]);
        continue;
      }
      if (cyclic || (sub && depth >= MAX_SUBFLOW_INLINE_DEPTH)) {
        n.ctx.notes.warn('subflow_not_inlined', `Subflow "${sub?.name ?? n.step.subflowId}" is recursive or nested too deeply; it is called as a sub-workflow.`, n.label);
      }
    }
    inlineSubflows(n.children, lookups, depth, stack);
  }
}

function walk(nodes: FlowNode[], fn: (n: FlowNode, inParallel: boolean) => void, inParallel = false): void {
  for (const n of nodes) {
    fn(n, inParallel);
    walk(n.children, fn, inParallel || n.cls === 'parallel');
  }
}

/** Steps that do not affect control flow when deciding if a branch is exit-only. */
function isNoiseStep(n: FlowNode): boolean {
  return n.cls === 'log' || (n.cls === 'container' && n.children.every(isNoiseStep));
}

function isExitOnlyBranch(nodes: FlowNode[]): boolean {
  return nodes.every((n) => {
    if (isNoiseStep(n) || n.cls === 'end' || n.cls === 'subflow_outputs') return true;
    if (n.cls === 'container') return isExitOnlyBranch(n.children);
    return false;
  });
}

/**
 * Catalog flows wrap "Ask For Approval" in a tiny subflow (approve → if rejected → set output → end)
 * and then check that output in the parent. Inlining that literally creates a chain of if/assign/end
 * nodes; collapse it to one approval whose reject path ends the flow.
 */
function matchApprovalGate(children: FlowNode[]): FlowNode | null {
  const meaningful = children.filter((n) => !isNoiseStep(n));
  if (meaningful.length === 0 || meaningful.length > 2) return null;
  if (meaningful[0].cls !== 'approval') return null;
  if (meaningful.length === 2) {
    if (meaningful[1].cls !== 'if' || !isExitOnlyBranch(meaningful[1].children)) return null;
  }
  return meaningful[0];
}

const FLATTEN_SINGLE = new Set<StepClass>(['email', 'notification', 'worknote', 'log']);

/**
 * Removes approval-gate scaffolding and lifts single-action subflows (e.g. email wrappers) so the
 * Nova graph matches the catalog author's intent instead of Flow Designer's nesting.
 */
function simplifyInlinedSubflows(nodes: FlowNode[]): void {
  for (const n of nodes) simplifyInlinedSubflows(n.children);

  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    if (n.cls !== 'inline_subflow') continue;

    const gate = matchApprovalGate(n.children);
    const next = nodes[i + 1];
    if (gate && next?.cls === 'if' && isExitOnlyBranch(next.children)) {
      const elseNode = nodes[i + 2];
      if (elseNode?.cls === 'else' && !isExitOnlyBranch(elseNode.children)) continue;
      n.cls = 'approval';
      n.flowName = n.defName;
      n.label = `${n.step.order}. ${n.defName}`;
      n.step = {
        ...gate.step,
        uiId: n.step.uiId,
        sysId: n.step.sysId,
        order: n.step.order,
        parentUiId: n.step.parentUiId,
        comment: gate.step.comment || n.defName,
      };
      n.children = [];
      n.innerCtx = undefined;
      n.rejectToFinish = true;
      const remove = elseNode?.cls === 'else' && isExitOnlyBranch(elseNode.children) ? 2 : 1;
      nodes.splice(i + 1, remove);
      continue;
    }

    const meaningful = n.children.filter((c) => !isNoiseStep(c));
    if (meaningful.length === 1 && FLATTEN_SINGLE.has(meaningful[0].cls)) {
      const child = meaningful[0];
      const inputs = n.innerCtx?.subflowInputs?.values ?? {};
      child.step = {
        ...child.step,
        uiId: n.step.uiId,
        sysId: n.step.sysId,
        order: n.step.order,
        parentUiId: n.step.parentUiId,
        values: { ...child.step.values, ...publicInputs(inputs) },
      };
      // Keep the child's pill scope so `{{subflow.*}}` inputs still resolve.
      nodes[i] = child;
    }
  }
}

function aliasKind(cls: StepClass): StepAlias['kind'] {
  if (cls === 'approval') return 'approval';
  if (cls === 'foreach') return 'loop';
  if (cls === 'subflow') return 'subflow';
  if (cls === 'inline_subflow') return 'inline_subflow';
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
          parseFieldAssignments(pick(values, 'ah_fields', 'fields')).map(({ field, value }) => [field, value]),
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
        lookups.calledSubflows.add(n.step.subflowId);
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
  return { config, preApproval, unmappedSteps, scriptSteps };
}
