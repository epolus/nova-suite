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
});

describe('transformServiceNowSnapshot (synthetic fixture)', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('produces a valid package and report', () => {
    const { package: pkg, report } = transformServiceNowSnapshot(fixture(), { schemaVersion: 'v00.01.23', now });
    expect(report.totals).toMatchObject({ items: 3, full: 1, partial: 2, unsupported: 0, subflows: 1, scriptSteps: 1 });

    const laptop = pkg.contents.catalog.service_items.find((i) => i.name === 'Standard Laptop')!;
    expect(laptop.category_external_key).toBe('sn/ce000000000000000000000000000002');
    expect(pkg.contents.catalog.categories.find((c) => c.external_key === laptop.category_external_key)!.name)
      .toBe('Hardware / Laptops');
    expect(laptop.tasks.map((t) => [t.external_key.split('/').pop(), t.task_type, t.task_order])).toEqual([
      ['approval', 'approval', 1],
      ['flow', 'automated', 2],
      ['manual-1', 'manual', 3],
      ['manual-2', 'manual', 4],
    ]);
    expect(laptop.tasks[0].assigned_group_name).toBe('IT Approvers');
    expect(laptop.tasks[2].assigned_group_name).toBe('Hardware Desk');
    expect(laptop.form_schema.fields.map((f) => f.name)).toEqual([
      'requested_for', 'laptop_model', 'justification', 'needed_by', 'accessories', 'cost_center', 'contact_email',
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
      subflow: 'call.workflow',
      update_record: 'action.ticket',
    });
    const cond = automation.states.find((s) => s.id === 'if') as { expression: unknown };
    expect(JSON.stringify(cond.expression)).toContain('"right":true');

    const legacy = report.items.find((i) => i.name === 'VPN Access')!;
    expect(legacy.notes.map((n) => n.code)).toContain('legacy_workflow');
    expect(pkg.contents.workflows.definitions).toHaveLength(1);
    expect(pkg.contents.workflows.definitions[0].workflow_type).toBe('sn_notify_asset_team');
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
    const laptop = selectPackageItems(pkg, ['sn/a1000000000000000000000000000001']);
    expect(laptop.contents.workflows.definitions.map((d) => d.workflow_type)).toEqual(['sn_notify_asset_team']);
  });
});
