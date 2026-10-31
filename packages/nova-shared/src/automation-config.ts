/* SPDX-License-Identifier: AGPL-3.0-only */
export type AutomationTransition = { to: string; when?: string };

export type AdvancedCondition =
  | { op: 'and' | 'or'; conditions: AdvancedCondition[] }
  | { op: 'not'; condition: AdvancedCondition }
  | { op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in'; left: unknown; right: unknown };

export const AUTOMATION_SCHEMA_VERSION = 1;

export const AUTOMATION_STATE_TYPES = [
  'activity',
  'decision',
  'delay',
  'end',
  'action.rest',
  'action.ci.create',
  'action.ci.lookup',
  'decision.advanced',
  'action.notification',
  'action.ticket',
  'action.assign',
  'action.script',
  'call.workflow',
  'loop.foreach',
  'parallel.fork',
  'parallel.join',
  'action.approval',
  'action.task',
  'variables.set',
] as const;

export const AUTOMATION_APPROVER_TYPES = ['user', 'group', 'group_manager', 'requester_manager'] as const;
export type AutomationApproverType = (typeof AUTOMATION_APPROVER_TYPES)[number];

export const AUTOMATION_LOOP_DEFAULT_MAX_ITERATIONS = 100;
export const AUTOMATION_LOOP_MAX_ITERATIONS_LIMIT = 1000;

export type AutomationStateType = (typeof AUTOMATION_STATE_TYPES)[number];

export const UNIFIED_BUILDER_NODE_TYPES = [
  'start',
  ...AUTOMATION_STATE_TYPES,
] as const;

export type UnifiedBuilderNodeType = (typeof UNIFIED_BUILDER_NODE_TYPES)[number];

export const UNIFIED_BUILDER_NODE_LABELS: Record<UnifiedBuilderNodeType, string> = {
  start: 'Start',
  activity: 'Activity',
  decision: 'Decision',
  delay: 'Delay',
  end: 'End',
  'action.rest': 'Action REST',
  'action.ci.lookup': 'Action CI Lookup',
  'action.ci.create': 'Action CI Create',
  'decision.advanced': 'Decision Advanced',
  'action.notification': 'Notification',
  'action.ticket': 'Ticket',
  'action.assign': 'Assignment',
  'action.script': 'Script',
  'call.workflow': 'Sub-workflow',
  'loop.foreach': 'For Each',
  'parallel.fork': 'Parallel Fork',
  'parallel.join': 'Parallel Join',
  'action.approval': 'Approval',
  'action.task': 'Manual Task',
  'variables.set': 'Set Variables',
};

export function isUnifiedBuilderNodeType(raw: string): raw is UnifiedBuilderNodeType {
  return (UNIFIED_BUILDER_NODE_TYPES as readonly string[]).includes(raw);
}

export type AutomationBranch = {
  skipTaskOrders?: number[];
  rejectRequest?: boolean;
  mergeFormData?: Record<string, string>;
  nextStateId?: string;
};

export type AutomationStateBase = {
  id: string;
  transitions?: AutomationTransition[];
};

export type AutomationHttpCommonState = AutomationStateBase & {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
  timeoutSeconds?: number;
  retryAttempts?: number;
  retryBackoffSec?: number;
  onError?: 'fail' | 'continue' | 'fallback';
  fallbackNodeId?: string;
  onSuccess?: AutomationBranch;
  onFailure?: AutomationBranch;
  attributes?: Record<string, unknown>;
  limit?: number;
  displayName?: string;
  status?: string;
  environment?: string;
};

export type AutomationActivityState = AutomationHttpCommonState & {
  type: 'activity';
};

export type AutomationRestActionState = AutomationHttpCommonState & {
  type: 'action.rest';
};

export type AutomationCiCreateActionState = AutomationHttpCommonState & {
  type: 'action.ci.create';
  className: string;
  name: string;
};

export type AutomationCiLookupActionState = AutomationHttpCommonState & {
  type: 'action.ci.lookup';
  className?: string;
};

export type AutomationDecisionState = AutomationStateBase & {
  type: 'decision';
  condition: string;
};

export type AutomationAdvancedDecisionState = AutomationStateBase & {
  type: 'decision.advanced';
  expression: AdvancedCondition;
};

export type AutomationDelayState = AutomationStateBase & {
  type: 'delay';
  delaySeconds?: number;
};

export type AutomationEndState = AutomationStateBase & {
  type: 'end';
  result?: 'success' | 'failure';
  onSuccess?: AutomationBranch;
  onFailure?: AutomationBranch;
};

export type AutomationNotificationActionState = AutomationStateBase & {
  type: 'action.notification';
  channel?: 'in_app' | 'email';
  recipientType?: string;
  titleTemplate?: string;
  bodyTemplate?: string;
};

export type AutomationTicketActionState = AutomationStateBase & {
  type: 'action.ticket';
  entity?: 'incident' | 'request';
  operation?: 'create' | 'update' | 'close' | 'work_note';
  fields?: Record<string, unknown>;
};

export type AutomationAssignActionState = AutomationStateBase & {
  type: 'action.assign';
  target?: 'user' | 'group';
  assigneeTemplate?: string;
  groupIdTemplate?: string;
};

export type AutomationScriptActionState = AutomationStateBase & {
  type: 'action.script';
  runtime?: 'js';
  code: string;
};

export type AutomationCallWorkflowState = AutomationStateBase & {
  type: 'call.workflow';
  workflowType?: string;
  definitionId?: string;
  input?: Record<string, unknown>;
};

/** Transitions: `item` enters the loop body, `done` exits; the body must route back to this state. */
export type AutomationLoopForeachState = AutomationStateBase & {
  type: 'loop.foreach';
  itemsExpr: string;
  maxIterations?: number;
};

/** Every transition starts a branch; branches run concurrently until they reach `joinId`. */
export type AutomationParallelForkState = AutomationStateBase & {
  type: 'parallel.fork';
  joinId: string;
};

export type AutomationParallelJoinState = AutomationStateBase & {
  type: 'parallel.join';
};

/** Suspends the automation until a human decides; transitions: `approved`, `rejected`. */
export type AutomationApprovalActionState = AutomationStateBase & {
  type: 'action.approval';
  approverType?: AutomationApproverType;
  approverTemplate?: string;
  name?: string;
  instructions?: string;
};

/**
 * Creates a manual fulfillment task. With `wait` (default) the automation suspends until the
 * task is completed. Transition: `success`.
 */
export type AutomationManualTaskState = AutomationStateBase & {
  type: 'action.task';
  name: string;
  instructions?: string;
  /** Assignment group name or id; templated. */
  groupTemplate?: string;
  /** Assignee user id or email; templated. */
  assigneeTemplate?: string;
  wait?: boolean;
};

export type AutomationVariablesSetState = AutomationStateBase & {
  type: 'variables.set';
  assignments: Record<string, string>;
};

export type AutomationState =
  | AutomationLoopForeachState
  | AutomationParallelForkState
  | AutomationParallelJoinState
  | AutomationApprovalActionState
  | AutomationManualTaskState
  | AutomationVariablesSetState
  | AutomationActivityState
  | AutomationRestActionState
  | AutomationCiCreateActionState
  | AutomationCiLookupActionState
  | AutomationDecisionState
  | AutomationAdvancedDecisionState
  | AutomationDelayState
  | AutomationEndState
  | AutomationNotificationActionState
  | AutomationTicketActionState
  | AutomationAssignActionState
  | AutomationScriptActionState
  | AutomationCallWorkflowState;

export type AutomationConfig = {
  kind: 'state_machine';
  schemaVersion: number;
  startAt: string;
  states: AutomationState[];
};

type AutomationValidationState = {
  id: string;
  type: AutomationStateType;
  transitions?: AutomationTransition[];
  method?: string;
  url?: string;
  condition?: string;
  expression?: AdvancedCondition;
  delaySeconds?: number;
  retryAttempts?: number;
  retryBackoffSec?: number;
  onError?: 'fail' | 'continue' | 'fallback';
  fallbackNodeId?: string;
  className?: string;
  name?: string;
  channel?: string;
  recipientType?: string;
  titleTemplate?: string;
  bodyTemplate?: string;
  entity?: string;
  operation?: string;
  target?: string;
  assigneeTemplate?: string;
  groupIdTemplate?: string;
  runtime?: string;
  code?: string;
  workflowType?: string;
  definitionId?: string;
  itemsExpr?: string;
  maxIterations?: number;
  wait?: unknown;
  joinId?: string;
  approverType?: string;
  approverTemplate?: string;
  instructions?: string;
  assignments?: unknown;
};

function collectCredentialSlugsFromString(raw: string, out: Set<string>): void {
  const re = /\{\{\s*cred\.([A-Za-z0-9_]+)(?:\.[^}\s.{]+)*\s*\}\}/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(raw)) !== null) out.add(m[1]);
}

export function collectCredentialSlugsFromAutomationConfig(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const cfg = raw as Record<string, unknown>;
  const states = Array.isArray(cfg.states) ? cfg.states : [];
  const out = new Set<string>();
  for (const s of states) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) continue;
    const state = s as Record<string, unknown>;
    for (const key of [
      'url',
      'body',
      'condition',
      'titleTemplate',
      'bodyTemplate',
      'assigneeTemplate',
      'groupIdTemplate',
      'code',
      'workflowType',
      'definitionId',
      'recipientType',
      'itemsExpr',
      'approverTemplate',
      'instructions',
    ] as const) {
      const val = state[key];
      if (typeof val === 'string') collectCredentialSlugsFromString(val, out);
    }
    for (const objKey of ['fields', 'input', 'attributes', 'assignments'] as const) {
      const val = state[objKey];
      if (val && typeof val === 'object') {
        collectCredentialSlugsFromString(JSON.stringify(val), out);
      }
      if (typeof val === 'string') collectCredentialSlugsFromString(val, out);
    }
    const headers = state.headers;
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      for (const v of Object.values(headers as Record<string, unknown>)) {
        if (typeof v === 'string') collectCredentialSlugsFromString(v, out);
      }
    }
    for (const branchKey of ['onSuccess', 'onFailure'] as const) {
      const branch = state[branchKey];
      if (!branch || typeof branch !== 'object' || Array.isArray(branch)) continue;
      const merge = (branch as Record<string, unknown>).mergeFormData;
      if (merge && typeof merge === 'object' && !Array.isArray(merge)) {
        for (const v of Object.values(merge as Record<string, unknown>)) {
          if (typeof v === 'string') collectCredentialSlugsFromString(v, out);
        }
      }
    }
  }
  return [...out];
}

export function isAdvancedCondition(raw: unknown): raw is AdvancedCondition {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const expr = raw as Record<string, unknown>;
  const op = typeof expr.op === 'string' ? expr.op : '';
  if (op === 'and' || op === 'or') {
    return Array.isArray(expr.conditions) &&
      expr.conditions.length > 0 &&
      expr.conditions.every((c) => isAdvancedCondition(c));
  }
  if (op === 'not') return isAdvancedCondition(expr.condition);
  if (['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'].includes(op)) {
    return Object.prototype.hasOwnProperty.call(expr, 'left') &&
      Object.prototype.hasOwnProperty.call(expr, 'right');
  }
  return false;
}

export function validateAutomationConfig(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return ['automation_config must be a JSON object'];
  }
  const cfg = raw as Record<string, unknown>;
  if (cfg.kind !== 'state_machine') errors.push('automation_config.kind must be "state_machine"');
  if (cfg.schemaVersion !== AUTOMATION_SCHEMA_VERSION) {
    errors.push(`automation_config.schemaVersion must be ${AUTOMATION_SCHEMA_VERSION}`);
  }
  if (typeof cfg.startAt !== 'string' || !cfg.startAt.trim()) errors.push('automation_config.startAt is required');
  if (!Array.isArray(cfg.states) || cfg.states.length === 0) {
    errors.push('automation_config.states must be a non-empty array');
    return errors;
  }
  if (cfg.states.length > 80) errors.push('automation_config.states cannot exceed 80 states');

  const states = cfg.states as unknown[];
  const byId = new Map<string, AutomationValidationState>();
  for (const s of states) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      errors.push('Each automation state must be an object');
      continue;
    }
    const st = s as AutomationValidationState;
    if (typeof st.id !== 'string' || !st.id.trim()) {
      errors.push('Each automation state requires a non-empty id');
      continue;
    }
    if (byId.has(st.id)) {
      errors.push(`Duplicate automation state id: ${st.id}`);
      continue;
    }
    byId.set(st.id, st);
  }

  const startAt = cfg.startAt as string;
  if (startAt && !byId.has(startAt)) errors.push('automation_config.startAt must reference a state id');

  for (const st of byId.values()) {
    if (!AUTOMATION_STATE_TYPES.includes(st.type)) {
      errors.push(`State "${st.id}" has invalid type`);
      continue;
    }
    const transitions = Array.isArray(st.transitions) ? st.transitions : [];
    if (st.type !== 'end' && transitions.length === 0) {
      errors.push(`State "${st.id}" requires at least one transition`);
    }
    if (st.type === 'activity' || st.type === 'action.rest' || st.type === 'action.ci.create' || st.type === 'action.ci.lookup') {
      if (typeof st.url !== 'string' || !st.url.trim()) errors.push(`Action "${st.id}" requires url`);
      if (st.method !== undefined && typeof st.method !== 'string') errors.push(`Action "${st.id}" method must be a string`);
      if (st.type === 'action.ci.create') {
        if (typeof st.className !== 'string' || !st.className) errors.push(`Action "${st.id}" requires className`);
        if (typeof st.name !== 'string' || !st.name) errors.push(`Action "${st.id}" requires name`);
      }
      if (st.type === 'action.ci.lookup' && st.className !== undefined && typeof st.className !== 'string') {
        errors.push(`Action "${st.id}" className must be a string when provided`);
      }
      if (st.retryAttempts !== undefined && (!Number.isInteger(st.retryAttempts) || st.retryAttempts < 1 || st.retryAttempts > 10)) {
        errors.push(`Action "${st.id}" retryAttempts must be an integer between 1 and 10`);
      }
      if (st.retryBackoffSec !== undefined && (typeof st.retryBackoffSec !== 'number' || st.retryBackoffSec < 0 || st.retryBackoffSec > 300)) {
        errors.push(`Action "${st.id}" retryBackoffSec must be between 0 and 300`);
      }
      if (st.onError === 'fallback' && (!st.fallbackNodeId || typeof st.fallbackNodeId !== 'string')) {
        errors.push(`Action "${st.id}" onError=fallback requires fallbackNodeId`);
      }
    } else if (st.type === 'decision') {
      if (typeof st.condition !== 'string' || !st.condition.trim()) errors.push(`Decision "${st.id}" requires condition`);
      const labels = new Set(transitions.map((t) => String((t as AutomationTransition).when || '')));
      if (!labels.has('true') || !labels.has('false')) {
        errors.push(`Decision "${st.id}" transitions must include when=true and when=false`);
      }
    } else if (st.type === 'decision.advanced') {
      if (!isAdvancedCondition(st.expression)) errors.push(`Decision "${st.id}" requires a valid expression object`);
      const labels = new Set(transitions.map((t) => String((t as AutomationTransition).when || '')));
      if (!labels.has('true') || !labels.has('false')) {
        errors.push(`Decision "${st.id}" transitions must include when=true and when=false`);
      }
    } else if (st.type === 'delay') {
      if (typeof st.delaySeconds !== 'number' || st.delaySeconds <= 0 || st.delaySeconds > 3600) {
        errors.push(`Delay "${st.id}" requires delaySeconds between 1 and 3600`);
      }
    } else if (st.type === 'end' && transitions.length > 0) {
      errors.push(`End state "${st.id}" cannot define transitions`);
    } else if (st.type === 'action.notification') {
      if (st.channel && st.channel !== 'in_app' && st.channel !== 'email') {
        errors.push(`State "${st.id}" channel must be in_app or email`);
      }
    } else if (st.type === 'action.ticket') {
      if (st.entity && st.entity !== 'incident' && st.entity !== 'request') {
        errors.push(`State "${st.id}" entity must be incident or request`);
      }
      if (
        st.operation &&
        st.operation !== 'create' &&
        st.operation !== 'update' &&
        st.operation !== 'close' &&
        st.operation !== 'work_note'
      ) {
        errors.push(`State "${st.id}" operation must be create, update, close, or work_note`);
      }
    } else if (st.type === 'action.assign') {
      if (st.target && st.target !== 'user' && st.target !== 'group') {
        errors.push(`State "${st.id}" target must be user or group`);
      }
    } else if (st.type === 'action.script') {
      if (typeof st.code !== 'string' || !st.code.trim()) {
        errors.push(`State "${st.id}" requires code`);
      }
      if (st.runtime && st.runtime !== 'js') {
        errors.push(`State "${st.id}" runtime must be js`);
      }
    } else if (st.type === 'call.workflow') {
      if (!String(st.workflowType || '').trim() && !String(st.definitionId || '').trim()) {
        errors.push(`State "${st.id}" requires workflowType or definitionId`);
      }
    } else if (st.type === 'loop.foreach') {
      if (typeof st.itemsExpr !== 'string' || !st.itemsExpr.trim()) {
        errors.push(`Loop "${st.id}" requires itemsExpr`);
      }
      if (
        st.maxIterations !== undefined &&
        (!Number.isInteger(st.maxIterations) || st.maxIterations < 1 || st.maxIterations > AUTOMATION_LOOP_MAX_ITERATIONS_LIMIT)
      ) {
        errors.push(`Loop "${st.id}" maxIterations must be an integer between 1 and ${AUTOMATION_LOOP_MAX_ITERATIONS_LIMIT}`);
      }
      const labels = new Set(transitions.map((t) => String((t as AutomationTransition).when || '')));
      if (!labels.has('item') || !labels.has('done')) {
        errors.push(`Loop "${st.id}" transitions must include when=item and when=done`);
      }
    } else if (st.type === 'parallel.fork') {
      if (typeof st.joinId !== 'string' || !st.joinId.trim()) {
        errors.push(`Parallel fork "${st.id}" requires joinId`);
      } else if (byId.get(st.joinId)?.type !== 'parallel.join') {
        errors.push(`Parallel fork "${st.id}" joinId must reference a parallel.join state`);
      }
    } else if (st.type === 'action.approval') {
      if (st.approverType !== undefined && !(AUTOMATION_APPROVER_TYPES as readonly string[]).includes(st.approverType)) {
        errors.push(`Approval "${st.id}" approverType must be one of ${AUTOMATION_APPROVER_TYPES.join(', ')}`);
      }
      if ((st.approverType === 'user' || st.approverType === 'group' || st.approverType === 'group_manager') &&
        (typeof st.approverTemplate !== 'string' || !st.approverTemplate.trim())) {
        errors.push(`Approval "${st.id}" requires approverTemplate for approverType ${st.approverType}`);
      }
      const labels = new Set(transitions.map((t) => String((t as AutomationTransition).when || '')));
      if (!labels.has('approved') || !labels.has('rejected')) {
        errors.push(`Approval "${st.id}" transitions must include when=approved and when=rejected`);
      }
    } else if (st.type === 'action.task') {
      if (typeof st.name !== 'string' || !st.name.trim()) errors.push(`Manual task "${st.id}" requires name`);
      if (st.wait !== undefined && typeof st.wait !== 'boolean') errors.push(`Manual task "${st.id}" wait must be a boolean`);
      const labels = new Set(transitions.map((t) => String((t as AutomationTransition).when || '')));
      if (![...labels].some((w) => w === 'success' || w === '')) {
        errors.push(`Manual task "${st.id}" transitions must include when=success (or a default transition)`);
      }
    } else if (st.type === 'variables.set') {
      const a = st.assignments;
      if (!a || typeof a !== 'object' || Array.isArray(a) || Object.keys(a).length === 0) {
        errors.push(`State "${st.id}" requires a non-empty assignments object`);
      } else {
        for (const [k, v] of Object.entries(a as Record<string, unknown>)) {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) errors.push(`State "${st.id}" assignment key "${k}" is not a valid variable name`);
          if (typeof v !== 'string') errors.push(`State "${st.id}" assignment "${k}" must be a string template`);
        }
      }
    }

    for (const t of transitions) {
      const tr = t as AutomationTransition;
      if (!tr || typeof tr !== 'object' || typeof tr.to !== 'string' || !tr.to.trim()) {
        errors.push(`State "${st.id}" has an invalid transition`);
        continue;
      }
      if (!byId.has(tr.to)) errors.push(`State "${st.id}" transition points to unknown state "${tr.to}"`);
    }
    if (st.onError === 'fallback' && st.fallbackNodeId && !byId.has(st.fallbackNodeId)) {
      errors.push(`Action "${st.id}" fallbackNodeId points to unknown state "${st.fallbackNodeId}"`);
    }
  }
  return errors;
}

export function parseAutomationConfig(raw: unknown): AutomationConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cfg = raw as Record<string, unknown>;
  if (cfg.kind !== 'state_machine') return null;
  if (cfg.schemaVersion !== AUTOMATION_SCHEMA_VERSION) return null;
  if (typeof cfg.startAt !== 'string' || !cfg.startAt.trim()) return null;
  if (!Array.isArray(cfg.states) || cfg.states.length === 0) return null;

  const states: AutomationState[] = [];
  for (const s of cfg.states) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    const state = s as Record<string, unknown>;
    if (typeof state.id !== 'string' || !state.id.trim()) return null;
    if (typeof state.type !== 'string' || !AUTOMATION_STATE_TYPES.includes(state.type as AutomationStateType)) return null;
    states.push(state as AutomationState);
  }

  const byId = new Set(states.map((s) => s.id));
  if (!byId.has(cfg.startAt)) return null;
  return {
    kind: 'state_machine',
    schemaVersion: AUTOMATION_SCHEMA_VERSION,
    startAt: cfg.startAt,
    states,
  };
}

export function validateAndParseAutomationConfig(raw: unknown): {
  config: AutomationConfig | null;
  errors: string[];
} {
  const errors = validateAutomationConfig(raw);
  if (errors.length > 0) return { config: null, errors };
  const config = parseAutomationConfig(raw);
  if (!config) {
    return { config: null, errors: ['automation_config failed runtime parse'] };
  }
  return { config, errors: [] };
}
