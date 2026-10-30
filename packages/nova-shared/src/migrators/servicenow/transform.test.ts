/* SPDX-License-Identifier: AGPL-3.0-only */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateAutomationConfig, type AutomationConfig } from '../../automation-config';
import { serviceNowSnapshotSchema } from './snapshot';
import { encodedQueryToCondition, parseEncodedQuery, parseFieldAssignments } from './transform/encoded-query';
import { selectPackageItems, transformServiceNowSnapshot } from './transform/package';
import { translatePillPath, translateTemplate, type PillContext } from './transform/pills';
import { NoteCollector } from './transform/report';
import { convertVariables } from './transform/variables';
import type { SnQuestionChoice, SnVariable } from './raw-schemas';

const fixture = () => serviceNowSnapshotSchema.parse(
  JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'synthetic-snapshot.json'), 'utf8')),
);

function variable(over: Partial<SnVariable>): SnVariable {
  return {
    sys_id: 'v1', name: 'x', question_text: 'X', type: 6, mandatory: false, default_value: '', help_text: '',
    tooltip: '', example_text: '', order: 100, cat_item: 'i', variable_set: '', reference: '', list_table: '',
    lookup_table: '', lookup_value: '', lookup_label: '', active: true, ...over,
  };
}

describe('convertVariables', () => {
  it('maps ServiceNow types to Nova form fields', () => {
    const notes = new NoteCollector();
    const choices: SnQuestionChoice[] = [
      { sys_id: 'c1', question: 'sel', text: 'Small', value: 's', order: 1 },
      { sys_id: 'c2', question: 'sel', text: 'Large', value: 'l', order: 2 },
    ];
    const { fields, mappings } = convertVariables([
      variable({ sys_id: 'yn', name: 'agree', type: 1 }),
      variable({ sys_id: 'sel', name: 'size', type: 5, default_value: 'l' }),
      variable({ sys_id: 'u', name: 'who', type: 8, reference: 'sys_user' }),
      variable({ sys_id: 'ci', name: 'device', type: 8, reference: 'cmdb_ci_computer' }),
      variable({ sys_id: 'dt', name: 'when', type: 10 }),
      variable({ sys_id: 'lbl', name: 'heading', type: 11 }),
      variable({ sys_id: 'lc', name: 'apps', type: 21, list_table: 'cmdb_ci_appl' }),
      variable({ sys_id: '9x', name: '9 Bad Name!', type: 6 }),
    ], choices, notes);
    expect(fields.map((f) => [f.name, f.type])).toEqual([
      ['agree', 'checkbox'],
      ['size', 'select'],
      ['who', 'user_ref'],
      ['device', 'cmdb_ref'],
      ['when', 'date'],
      ['apps', 'textarea'],
      ['f_9_bad_name', 'text'],
    ]);
    expect(fields[1]).toMatchObject({ options: ['Small', 'Large'], defaultValue: 'Large' });
    expect(mappings.get('agree')!.mapValue('true')).toBe(true);
    expect(mappings.get('size')!.mapValue('s')).toBe('Small');
    expect(notes.notes.map((n) => n.code)).toEqual(
      expect.arrayContaining(['variable_dropped', 'list_collector', 'datetime_to_date']),
    );
  });
});

describe('data pills', () => {
  const ctx = (): PillContext => ({
    fields: new Map([['laptop_model', { snName: 'laptop_model', fieldName: 'laptop_model', type: 'select', mapValue: (v) => v.toUpperCase() }]]),
    aliases: new Map([
      ['look_up_record_1', { stateId: 'lookup', kind: 'action' }],
      ['for_each_1', { stateId: 'each', kind: 'loop' }],
      ['ask_for_approval_1', { stateId: 'approve', kind: 'approval' }],
    ]),
    isSubflow: false,
    notes: new NoteCollector(),
  });

  it('translates trigger, flow variable, step, loop and approval pills', () => {
    const c = ctx();
    expect(translatePillPath('trigger.request_item.variables.laptop_model', c)).toBe('request.form_data.laptop_model');
    expect(translatePillPath('trigger.request_item.number', c)).toBe('request.number');
    expect(translatePillPath('trigger.request_item.requested_for', c)).toBe('request.requested_for');
    expect(translatePillPath('trigger.request_item.variables.requested_for', c)).toBe('request.requested_for');
    expect(translatePillPath('flow_variables.count', c)).toBe('vars.count');
    expect(translatePillPath('look_up_record_1.Record.name', c)).toBe('state.lookup.body.name');
    expect(translatePillPath('for_each_1.item.name', c)).toBe('loop.each.item.name');
    expect(translatePillPath('ask_for_approval_1.approval_state', c)).toBe('state.approve.body.outcome');
    expect(translatePillPath('mystery.thing', c)).toBeNull();
  });

  it('leaves unknown pills untouched and reports them', () => {
    const c = ctx();
    expect(translateTemplate('Hi {{trigger.request_item.number}} {{mystery.x}}', c)).toBe('Hi {{request.number}} {{mystery.x}}');
    expect(c.notes.notes.some((n) => n.code === 'pill_unresolved')).toBe(true);
  });
});

describe('encoded queries', () => {
  const ctx = (): PillContext => ({
    fields: new Map([['size', { snName: 'size', fieldName: 'size', type: 'select', mapValue: (v) => (v === 'l' ? 'Large' : v) }]]),
    aliases: new Map(),
    isSubflow: false,
    notes: new NoteCollector(),
  });

  it('splits ^, ^OR and ^NQ groups', () => {
    expect(parseEncodedQuery('a=1^b!=2^ORc=3^NQd=4')).toEqual([
      [[{ field: 'a', op: '=', value: '1' }], [{ field: 'b', op: '!=', value: '2' }, { field: 'c', op: '=', value: '3' }]],
      [[{ field: 'd', op: '=', value: '4' }]],
    ]);
  });

  it('maps pill fields and choice values into an advanced condition', () => {
    const cond = encodedQueryToCondition('{{trigger.request_item.variables.size}}=l^size!=s', ctx());
    expect(cond).toEqual({
      op: 'and',
      conditions: [
        { op: 'eq', left: { var: 'request.form_data.size' }, right: 'Large' },
        { op: 'ne', left: { var: 'request.form_data.size' }, right: 's' },
      ],
    });
  });

  it('parses field assignments', () => {
    expect(parseFieldAssignments('short_description=Hi {{trigger.request_item.number}}^state=3')).toEqual([
      { field: 'short_description', value: 'Hi {{trigger.request_item.number}}' },
      { field: 'state', value: '3' },
    ]);
  });

  it('fails closed on unknown operators and unparsed queries', () => {
    const notes = new NoteCollector();
    const c = encodedQueryToCondition('priorityBETWEEN1@2', { fields: new Map(), aliases: new Map(), isSubflow: false, notes });
    expect(c).toEqual({ op: 'eq', left: 1, right: 0 });
    expect(notes.notes.some((n) => n.code === 'condition_operator' || n.code === 'condition_unparsed')).toBe(true);

    const notes2 = new NoteCollector();
    const empty = encodedQueryToCondition('ORDERBYpriority', { fields: new Map(), aliases: new Map(), isSubflow: false, notes: notes2 });
    expect(empty).toEqual({ op: 'eq', left: 1, right: 0 });
    expect(notes2.notes.some((n) => n.code === 'condition_unparsed')).toBe(true);
  });
});

describe('transformServiceNowSnapshot (subflows and catalog tasks)', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  /** Mirrors a typical Service Catalog flow: approval subflow (referenced by snapshot), then tasks. */
  function snapshotWithSubflow() {
    const snap = fixture();
    snap.logicDefinitions.push({ sys_id: '1d000000000000000000000000000005', name: 'Assign Subflow Outputs', type: 'assign_subflow_outputs' });
    snap.groups.push({ sys_id: '90000000000000000000000000000003', name: 'Procurement' });
    const step = (over: Record<string, unknown>) => ({
      kind: 'action', sysId: `x${String(over.uiId)}`, parentUiId: '', comment: '', definitionId: '', subflowId: '', values: {}, ...over,
    });
    const main = snap.flows[0];
    main.steps = [
      step({ kind: 'subflow', uiId: 'm1', order: 1, subflowId: 'snap0000000000000000000000000001',
        values: { ritm: '{{Service Catalog_1.request_item}}' } }),
      step({ kind: 'logic', uiId: 'm2', order: 2, definitionId: '1d000000000000000000000000000001',
        values: { condition: '{{manager_approval_1.approval_state}}=approved' } }),
      step({ uiId: 'm3', parentUiId: 'm2', order: 3, definitionId: 'at000000000000000000000000000004', values: {
        ah_short_description: 'Order {{Service Catalog_1.request_item.number}}',
        ah_fields: 'assignment_group={"display":"Procurement","value":"90000000000000000000000000000003"}^description=Place the order',
        ah_wait: 'true',
      } }),
      step({ uiId: 'm4', order: 4, definitionId: 'at000000000000000000000000000003', values: {
        ah_to: '{{Service Catalog_1.request_item.requested_for}}',
        ah_subject: 'Update',
        ah_body: '<p>Item <span data-pillvalue="{{Service Catalog_1.request_item.number}}"><span class="data_pill">Number</span></span></p>',
      } }),
    ] as typeof main.steps;
    const sub = snap.flows[1];
    Object.assign(sub, { sys_id: 'snap0000000000000000000000000001', name: 'Manager Approval', internal_name: 'manager_approval' });
    sub.steps = [
      step({ uiId: 's1', order: 1, definitionId: 'at000000000000000000000000000001', values: { table: '{{subflow.ritm}}' } }),
      step({ kind: 'logic', uiId: 's2', order: 2, definitionId: '1d000000000000000000000000000005',
        values: { approval_state: '{{ask_for_approval_1.approval_state}}' } }),
    ] as typeof sub.steps;
    return snap;
  }

  it('inlines the subflow and keeps every step connected', () => {
    const { package: pkg } = transformServiceNowSnapshot(snapshotWithSubflow(), { schemaVersion: 'v00.01.23', now });
    const laptop = pkg.contents.catalog.service_items.find((i) => i.name === 'Standard Laptop')!;
    expect(laptop.tasks.map((t) => t.task_type)).toEqual(['automated']);
    const automation = laptop.tasks[0].automation_config as AutomationConfig;
    expect(validateAutomationConfig(automation)).toEqual([]);
    expect(pkg.contents.workflows.definitions).toEqual([]);

    const byId = new Map(automation.states.map((s) => [s.id, s]));
    const reachable = new Set<string>();
    const visit = (id: string) => {
      if (reachable.has(id)) return;
      reachable.add(id);
      for (const t of (byId.get(id) as { transitions?: Array<{ to: string }> }).transitions ?? []) visit(t.to);
    };
    visit(automation.startAt);
    expect([...byId.keys()].filter((id) => !reachable.has(id))).toEqual([]);

    expect(automation.startAt).toBe('ask_for_approval');
    expect(byId.get('ask_for_approval')).toMatchObject({
      type: 'action.approval', name: 'Manager Approval',
      transitions: expect.arrayContaining([{ to: 'ask_for_approval_rejected', when: 'rejected' }]),
    });
    expect(byId.get('ask_for_approval_rejected')).toMatchObject({ assignments: { sn_approval_rejected: 'true' } });
    const outputs = automation.states.find((s) => s.type === 'variables.set' && 'manager_approval_approval_state' in s.assignments);
    expect(outputs).toBeDefined();
    expect(byId.get('if')).toMatchObject({
      expression: { op: 'eq', left: { var: 'vars.manager_approval_approval_state' }, right: 'approved' },
    });
    expect(byId.get('create_catalog_task')).toMatchObject({
      type: 'action.task', name: 'Order {{request.number}}', instructions: 'Place the order',
      groupTemplate: 'Procurement', transitions: [{ to: 'send_email', when: 'success' }],
    });
    expect((byId.get('create_catalog_task') as { wait?: boolean }).wait).not.toBe(false);
    expect(byId.get('send_email')).toMatchObject({
      recipientType: 'requested_for', bodyTemplate: 'Item {{request.number}}', transitions: [{ to: 'finish', when: 'success' }],
    });
    expect(byId.get('finish')).toMatchObject({ transitions: [{ to: 'end_rejected', when: 'true' }, { to: 'end_success', when: 'false' }] });
    expect(byId.get('end_rejected')).toMatchObject({ result: 'failure', onFailure: { rejectRequest: true } });
  });

  it('collapses approval-gate subflows into a single approval that rejects the request', () => {
    const snap = fixture();
    snap.logicDefinitions.push(
      { sys_id: '1d000000000000000000000000000005', name: 'Assign Subflow Outputs', type: 'assign_subflow_outputs' },
      { sys_id: '1d000000000000000000000000000006', name: 'End', type: 'end' },
    );
    const step = (over: Record<string, unknown>) => ({
      kind: 'action', sysId: `g${String(over.uiId)}`, parentUiId: '', comment: '', definitionId: '', subflowId: '', values: {}, ...over,
    });
    const main = snap.flows[0];
    main.steps = [
      step({ kind: 'subflow', uiId: 'm1', order: 1, subflowId: 'snap0000000000000000000000000001',
        values: { ritm: '{{Service Catalog_1.request_item}}' } }),
      step({ kind: 'logic', uiId: 'm2', order: 2, definitionId: '1d000000000000000000000000000001',
        values: { condition: '{{manager_approval_1.rejected}}=true' } }),
      step({ kind: 'logic', uiId: 'm2e', parentUiId: 'm2', order: 3, definitionId: '1d000000000000000000000000000006', values: {} }),
      step({ uiId: 'm3', order: 4, definitionId: 'at000000000000000000000000000003', values: {
        ah_to: '{{Service Catalog_1.request_item.requested_for}}', ah_subject: 'Go', ah_body: 'ok',
      } }),
    ] as typeof main.steps;
    const sub = snap.flows[1];
    Object.assign(sub, { sys_id: 'snap0000000000000000000000000001', name: 'Manager Approval', internal_name: 'manager_approval' });
    sub.steps = [
      step({ uiId: 's1', order: 1, definitionId: 'at000000000000000000000000000001', values: {} }),
      step({ kind: 'logic', uiId: 's2', order: 2, definitionId: '1d000000000000000000000000000001',
        values: { condition: '{{ask_for_approval_1.approval_state}}=rejected' } }),
      step({ kind: 'logic', uiId: 's2a', parentUiId: 's2', order: 2.1, definitionId: '1d000000000000000000000000000005',
        values: { rejected: 'true' } }),
      step({ kind: 'logic', uiId: 's2e', parentUiId: 's2', order: 2.2, definitionId: '1d000000000000000000000000000006', values: {} }),
    ] as typeof sub.steps;

    const { package: pkg } = transformServiceNowSnapshot(snap, { schemaVersion: 'v00.01.23', now });
    const laptop = pkg.contents.catalog.service_items.find((i) => i.name === 'Standard Laptop')!;
    // Leading manager approval becomes the service-item flag; only the automation task remains.
    expect(laptop.approval_required).toBe(true);
    expect(laptop.tasks.map((t) => t.task_type)).toEqual(['automated']);
    const automation = laptop.tasks[0].automation_config as AutomationConfig;
    expect(validateAutomationConfig(automation)).toEqual([]);
    expect(automation.startAt).toBe('send_email');
    expect(automation.states.map((s) => s.id).sort()).toEqual(['end_success', 'send_email']);
    expect(automation.states.find((s) => s.id === 'send_email')).toMatchObject({
      transitions: [{ to: 'end_success', when: 'success' }],
    });
  });
});

describe('transformServiceNowSnapshot (synthetic fixture)', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('produces a valid package and report', () => {
    const { package: pkg, report } = transformServiceNowSnapshot(fixture(), { schemaVersion: 'v00.01.23', now });
    expect(report.totals).toMatchObject({ items: 3, full: 1, partial: 2, unsupported: 0, subflows: 0, scriptSteps: 1 });

    const laptop = pkg.contents.catalog.service_items.find((i) => i.name === 'Standard Laptop')!;
    expect(laptop.category_external_key).toBe('sn/ce000000000000000000000000000002');
    expect(pkg.contents.catalog.categories.find((c) => c.external_key === laptop.category_external_key)!.name)
      .toBe('Hardware / Laptops');
    expect(laptop.tasks.map((t) => [t.external_key.split('/').pop(), t.task_type, t.task_order])).toEqual([
      ['approval', 'approval', 1],
      ['flow', 'automated', 2],
    ]);
    expect(laptop.tasks[0].assigned_group_name).toBe('IT Approvers');
    expect(laptop.form_schema.fields.map((f) => f.name)).toEqual([
      'laptop_model', 'justification', 'needed_by', 'accessories', 'cost_center', 'contact_email',
    ]);

    const automation = laptop.tasks[1].automation_config as unknown as AutomationConfig;
    expect(validateAutomationConfig(automation)).toEqual([]);
    const types = Object.fromEntries(automation.states.map((s) => [s.id, s.type]));
    expect(types).toMatchObject({
      if: 'decision.advanced',
      create_record: 'action.ci.create',
      send_email: 'action.notification',
      set_flow_variables: 'variables.set',
      for_each: 'loop.foreach',
      add_worknote: 'action.ticket',
      run_script: 'action.script',
      create_catalog_task: 'action.task',
      create_jira_issue: 'action.task',
      send_email_2: 'action.notification',
      update_record: 'action.ticket',
    });
    expect(automation.states.find((s) => s.id === 'create_catalog_task')).toMatchObject({
      groupTemplate: 'Hardware Desk',
      transitions: [{ to: 'run_script', when: 'success' }],
    });
    expect(automation.states.some((s) => s.id === 'finish')).toBe(false);
    const cond = automation.states.find((s) => s.id === 'if') as { expression: unknown };
    expect(JSON.stringify(cond.expression)).toContain('"right":true');

    const legacy = report.items.find((i) => i.name === 'VPN Access')!;
    expect(legacy.notes.map((n) => n.code)).toContain('legacy_workflow');
    expect(pkg.contents.workflows.definitions).toEqual([]);
  });

  it('matches the golden package', () => {
    const { package: pkg, report } = transformServiceNowSnapshot(fixture(), { schemaVersion: 'v00.01.23', now });
    expect({ package: pkg, report }).toMatchSnapshot();
  });

  it('selects items with their categories and called sub-workflows', () => {
    const { package: pkg } = transformServiceNowSnapshot(fixture(), { schemaVersion: 'v00.01.23', now });
    const onlyVpn = selectPackageItems(pkg, ['sn/a1000000000000000000000000000002']);
    expect(onlyVpn.contents.catalog.service_items).toHaveLength(1);
    expect(onlyVpn.contents.catalog.categories.map((c) => c.name)).toEqual(['Access']);
    expect(onlyVpn.contents.workflows.definitions).toHaveLength(0);
  });

  it('keeps sub-workflows called transitively by the selected items', () => {
    const { package: pkg } = transformServiceNowSnapshot(fixture(), { schemaVersion: 'v00.01.23', now });
    const call = (workflowType: string) => ({
      kind: 'state_machine', schemaVersion: 1, startAt: 'c', states: [{ id: 'c', type: 'call.workflow', workflowType }],
    });
    pkg.contents.catalog.service_items[0].tasks[1].automation_config = call('sn_a');
    pkg.contents.workflows.definitions = [
      { name: 'A', workflow_type: 'sn_a', description: '', definition: call('sn_b') as never },
      { name: 'B', workflow_type: 'sn_b', description: '', definition: call('sn_b') as never },
      { name: 'C', workflow_type: 'sn_c', description: '', definition: call('sn_c') as never },
    ];
    const laptop = selectPackageItems(pkg, ['sn/a1000000000000000000000000000001']);
    expect(laptop.contents.workflows.definitions.map((d) => d.workflow_type)).toEqual(['sn_a', 'sn_b']);
  });
});
