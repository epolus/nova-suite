/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  AUTOMATION_SCHEMA_VERSION,
  validateAutomationConfig,
  type AdvancedCondition,
  type AutomationApproverType,
  type AutomationConfig,
  type AutomationState,
} from '../../../automation-config';
import type { LegacyWorkflow } from '../snapshot';
import { encodedQueryToCondition } from './encoded-query';
import { MAX_AUTOMATION_STATES, type FlowConversionResult, type FlowLookups } from './flow-types';
import { translateTemplate, type PillContext } from './pills';
import type { NoteCollector } from './report';
import { htmlToText, slugify, truncate } from './text';
import type { FieldMapping } from './variables';

/** Legacy activities use `${current.field}` and `$(current.field)` instead of Flow Designer pills. */
export function legacyTemplate(value: string): string {
  return value
    .replace(/\$\{([^}]+)\}/g, '{{$1}}')
    .replace(/\$\(([^)]+)\)/g, '{{$1}}');
}

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

type Activity = LegacyWorkflow['activities'][number];
type Transition = LegacyWorkflow['transitions'][number];

function isBegin(a: Activity): boolean {
  return /^begin$/i.test(a.definitionName) || /^begin$/i.test(a.name);
}

function isEnd(a: Activity): boolean {
  return /^end$/i.test(a.definitionName) || /^complete$/i.test(a.definitionName);
}

function isDeptHead(text: string): boolean {
  return /dept(?:artment)?[\s_-]*head|department[\s_-]*manager/i.test(text);
}

function outcome(t: Transition): 'approved' | 'rejected' | 'true' | 'false' | null {
  const label = `${t.name} ${t.condition}`.toLowerCase();
  if (/reject/.test(label)) return 'rejected';
  if (/approv/.test(label)) return 'approved';
  if (/\belse\b/.test(label) || /\bfalse\b/.test(label)) return 'false';
  if (t.condition && !/\belse\b/.test(label)) return 'true';
  return null;
}

export function convertLegacyWorkflow(
  workflow: LegacyWorkflow,
  opts: {
    lookups: FlowLookups;
    fields: Map<string, FieldMapping>;
    notes: NoteCollector;
    extractPreApproval: boolean;
  },
): FlowConversionResult {
  const { lookups, notes } = opts;
  const ctx: PillContext = {
    fields: opts.fields,
    aliases: new Map(),
    isSubflow: false,
    notes,
  };
  const activities = [...workflow.activities].sort((a, b) => a.y - b.y || a.x - b.x);
  const bySys = new Map(activities.map((a) => [a.sysId, a]));
  const outgoing = new Map<string, Transition[]>();
  for (const t of workflow.transitions) {
    const list = outgoing.get(t.from) ?? [];
    list.push(t);
    outgoing.set(t.from, list);
  }
  const incoming = new Set(workflow.transitions.map((t) => t.to));
  const begin = activities.find(isBegin) ?? activities.find((a) => !incoming.has(a.sysId) && !isEnd(a));

  const used = new Set<string>(['end_success', 'end_rejected', 'finish']);
  const stateId = new Map<string, string>();
  for (const a of activities) {
    if (isBegin(a) || isEnd(a)) continue;
    const base = slugify(a.name || a.definitionName || 'step');
    let id = base;
    let i = 1;
    while (used.has(id)) id = `${base}_${++i}`;
    used.add(id);
    stateId.set(a.sysId, id);
  }

  const targetOf = (sysId: string): string => {
    const a = bySys.get(sysId);
    if (!a || isEnd(a)) return 'end_success';
    if (isBegin(a)) {
      const next = outgoing.get(a.sysId)?.[0];
      return next ? targetOf(next.to) : 'end_success';
    }
    return stateId.get(sysId) ?? 'end_success';
  };

  const states: AutomationState[] = [];
  const unmappedSteps: FlowConversionResult['unmappedSteps'] = [];
  let scriptSteps = 0;
  let preApproval: FlowConversionResult['preApproval'] = null;
  let needsReject = false;

  const translate = (raw: string) => translateTemplate(legacyTemplate(raw), ctx);

  const resolveApprover = (a: Activity): { type: AutomationApproverType; template: string } => {
    const described = `${a.definitionName} ${a.name} ${JSON.stringify(a.values)}`;
    if (isDeptHead(described)) {
      notes.info('department_manager', 'Department head approval uses the manager of the request subject\'s department.', a.name);
      return { type: 'department_manager', template: '' };
    }
    const rules = pick(a.values, 'approver', 'approvers', 'users', 'user', 'approval_script', 'rules', 'group', 'groups');
    if (/manager/i.test(rules) && !/[0-9a-f]{32}/i.test(rules)) return { type: 'requester_manager', template: '' };
    const groupId = pick(a.values, 'group', 'groups', 'assignment_group');
    if (/group/i.test(a.definitionName) || groupId) {
      const name = lookups.groups.get(groupId)?.name;
      if (groupId && !name) notes.warn('approval_group_unresolved', `Approval group ${groupId} not found; set the approver after import.`, a.name);
      return { type: 'group', template: name || groupId };
    }
    const userId = pick(a.values, 'user', 'users', 'approver');
    if (/^[0-9a-f]{32}$/i.test(userId)) {
      const u = lookups.users.get(userId);
      if (!u) notes.warn('approval_user_unresolved', `Approval user ${userId} not found; set the approver after import.`, a.name);
      return { type: 'user', template: u?.email || u?.user_name || userId };
    }
    if (/manager/i.test(described)) return { type: 'requester_manager', template: '' };
    notes.warn('approval_rules_unparsed', 'Approval rules could not be parsed; defaulting to the requester\'s manager.', a.name);
    return { type: 'requester_manager', template: '' };
  };

  const firstReal = begin ? bySys.get(outgoing.get(begin.sysId)?.[0]?.to ?? '') : activities.find((a) => !isBegin(a) && !isEnd(a));

  for (const a of activities) {
    if (isBegin(a) || isEnd(a)) continue;
    const id = stateId.get(a.sysId)!;
    const outs = outgoing.get(a.sysId) ?? [];
    const def = a.definitionName.toLowerCase();
    const nextDefault = outs[0] ? targetOf(outs[0].to) : 'end_success';

    if (/approval/.test(def) || /approval/.test(a.name.toLowerCase())) {
      const approver = resolveApprover(a);
      const groupResolved = approver.type === 'group' && [...lookups.groups.values()].some((g) => g.name === approver.template);
      if (opts.extractPreApproval && firstReal?.sysId === a.sysId && (approver.type === 'requester_manager' || groupResolved)) {
        preApproval = {
          name: truncate(a.name || 'Approval', 200),
          approverType: approver.type === 'requester_manager' ? 'requester_manager' : 'group',
          groupName: approver.type === 'requester_manager' ? null : approver.template,
        };
        notes.info(
          approver.type === 'requester_manager' ? 'manager_approval' : 'pre_approval',
          approver.type === 'requester_manager'
            ? 'Leading manager approval became the service item "Manager approval" setting.'
            : 'Leading approval became a catalog approval task before the automation.',
          a.name,
        );
        continue;
      }
      const approved = outs.find((t) => outcome(t) === 'approved');
      const rejected = outs.find((t) => outcome(t) === 'rejected');
      if (rejected || !approved) needsReject = true;
      states.push({
        id,
        type: 'action.approval',
        approverType: approver.type,
        ...(approver.template ? { approverTemplate: approver.template } : {}),
        name: truncate(a.name || 'Approval', 200),
        instructions: 'Migrated from a ServiceNow legacy workflow. Approve or reject this request.',
        transitions: [
          { to: approved ? targetOf(approved.to) : nextDefault, when: 'approved' },
          { to: rejected ? targetOf(rejected.to) : 'end_rejected', when: 'rejected' },
        ],
      });
      continue;
    }

    if (/catalog task|create task|sc_task/.test(def) || /catalog task/.test(a.name.toLowerCase())) {
      const groupRaw = pick(a.values, 'assignment_group', 'fulfillment_group', 'group');
      const groupName = lookups.groups.get(groupRaw)?.name || null;
      if (groupRaw && !groupName) notes.warn('task_group_unresolved', `Assignment group ${groupRaw} not found.`, a.name);
      const userRaw = pick(a.values, 'assigned_to', 'assignee');
      const assignee = lookups.users.get(userRaw)?.email || '';
      const waitRaw = pick(a.values, 'wait_for_completion', 'wait').toLowerCase();
      const name = htmlToText(translate(pick(a.values, 'short_description', 'task_short_description', 'name') || a.name)) || 'Catalog task';
      const instructions = htmlToText(translate(pick(a.values, 'description', 'task_description', 'instructions')));
      notes.info('catalog_task', 'Catalog task becomes a manual task inside the flow.', a.name);
      states.push({
        id,
        type: 'action.task',
        name: truncate(name, 255),
        ...(instructions ? { instructions: truncate(instructions, 4000) } : {}),
        ...(groupName ? { groupTemplate: groupName } : {}),
        ...(assignee ? { assigneeTemplate: assignee } : {}),
        ...(waitRaw === '0' || waitRaw === 'false' ? { wait: false } : {}),
        transitions: [{ to: nextDefault, when: 'success' }],
      });
      continue;
    }

    if (/^if$/.test(def) || def === 'condition') {
      const yes = outs.find((t) => outcome(t) === 'true') ?? outs.find((t) => t.condition);
      const no = outs.find((t) => t !== yes);
      const query = yes?.condition ?? '';
      let expression: AdvancedCondition;
      if (!query || /javascript:/i.test(query)) {
        notes.warn('condition_unparsed', `Legacy condition "${query.slice(0, 120)}" could not be parsed; treated as false.`, a.name);
        expression = { op: 'eq', left: 1, right: 0 };
      } else {
        expression = encodedQueryToCondition(legacyTemplate(query), ctx);
      }
      states.push({
        id,
        type: 'decision.advanced',
        expression,
        transitions: [
          { to: yes ? targetOf(yes.to) : 'end_success', when: 'true' },
          { to: no ? targetOf(no.to) : 'end_success', when: 'false' },
        ],
      });
      continue;
    }

    if (/notification|send email|email/.test(def)) {
      const to = translate(pick(a.values, 'to', 'recipients', 'users'));
      states.push({
        id,
        type: 'action.notification',
        channel: 'email',
        recipientType: to.includes('@') || to.includes('{{') ? to : 'requester',
        titleTemplate: htmlToText(translate(pick(a.values, 'subject', 'title') || 'Update on {{request.number}}')),
        bodyTemplate: htmlToText(translate(pick(a.values, 'body', 'message', 'comments') || 'Your request {{request.number}} was updated.')),
        transitions: [{ to: nextDefault, when: 'success' }],
      });
      continue;
    }

    if (/timer|wait/.test(def)) {
      const seconds = Number(pick(a.values, 'duration', 'seconds', 'timer')) || 0;
      if (seconds <= 0) {
        notes.warn('wait_unparsed', 'Wait duration could not be parsed; step skipped.', a.name);
        continue;
      }
      states.push({
        id,
        type: 'delay',
        delaySeconds: Math.min(3600, Math.round(seconds)),
        transitions: [{ to: nextDefault }],
      });
      continue;
    }

    if (/script/.test(def)) {
      scriptSteps += 1;
      notes.warn('step_placeholder', 'Run Script is not converted. It becomes a manual task in the flow.', a.name);
      unmappedSteps.push({ label: a.name, definition: a.definitionName, inputs: a.values });
      states.push({
        id,
        type: 'action.task',
        name: truncate(`Manual step: ${a.name || a.definitionName}`, 255),
        instructions: truncate(`Migrated from legacy workflow "${workflow.name}". Run Script was not converted.\n\n${JSON.stringify(a.values, null, 2)}`, 4000),
        transitions: [{ to: nextDefault, when: 'success' }],
      });
      continue;
    }

    notes.warn('step_placeholder', `Activity "${a.definitionName || a.name}" is not supported. It becomes a manual task in the flow.`, a.name);
    unmappedSteps.push({ label: a.name, definition: a.definitionName, inputs: a.values });
    states.push({
      id,
      type: 'action.task',
      name: truncate(`Manual step: ${a.name || a.definitionName}`, 255),
      instructions: truncate(`Migrated from legacy workflow "${workflow.name}".\n\n${JSON.stringify(a.values, null, 2)}`, 4000),
      transitions: [{ to: nextDefault, when: 'success' }],
    });
  }

  let startAt = begin ? targetOf(outgoing.get(begin.sysId)?.[0]?.to ?? '') : (states[0]?.id ?? 'end_success');
  if (preApproval && firstReal) {
    const approved = (outgoing.get(firstReal.sysId) ?? []).find((t) => outcome(t) === 'approved');
    startAt = approved ? targetOf(approved.to) : startAt;
  }
  if (needsReject) {
    states.push({ id: 'end_rejected', type: 'end', result: 'failure', onFailure: { rejectRequest: true } });
  }
  states.push({ id: 'end_success', type: 'end', result: 'success' });

  const meaningful = states.filter((s) => s.id !== 'end_success' && s.id !== 'end_rejected');
  let config: AutomationConfig | null = null;
  if (meaningful.length > 0) {
    const candidate: AutomationConfig = {
      kind: 'state_machine',
      schemaVersion: AUTOMATION_SCHEMA_VERSION,
      startAt,
      states,
    };
    if (states.length > MAX_AUTOMATION_STATES) {
      notes.error('flow_too_large', `Converted workflow has ${states.length} states (Nova limit ${MAX_AUTOMATION_STATES}).`);
    } else {
      const errors = validateAutomationConfig(candidate);
      if (errors.length > 0) {
        for (const e of errors.slice(0, 5)) notes.error('automation_invalid', e);
      } else {
        config = candidate;
      }
    }
  }

  return { config, preApproval, unmappedSteps, scriptSteps, calledSubflowIds: [] };
}
