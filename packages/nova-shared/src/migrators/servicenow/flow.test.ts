/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { convertFlow, type FlowLookups } from './transform/flow';
import { parseDurationSeconds } from './transform/step-values';
import { NoteCollector } from './transform/report';
import type { ServiceNowFlow, ServiceNowStep } from './snapshot';

function step(over: Partial<ServiceNowStep> & { uiId: string; order: number }): ServiceNowStep {
  return {
    kind: 'action',
    sysId: `sys_${over.uiId}`,
    parentUiId: '',
    comment: '',
    definitionId: over.definitionId ?? '',
    subflowId: '',
    values: {},
    ...over,
  };
}

function emptyLookups(over: Partial<FlowLookups> = {}): FlowLookups {
  return {
    actionTypes: new Map(),
    logicDefinitions: new Map(),
    groups: new Map(),
    users: new Map(),
    subflowTypes: new Map(),
    flows: new Map(),
    ...over,
  };
}

function flow(steps: ServiceNowStep[], over: Partial<ServiceNowFlow> = {}): ServiceNowFlow {
  return {
    sys_id: 'flow1',
    name: 'Test flow',
    description: '',
    active: true,
    type: 'flow',
    internal_name: 'test_flow',
    triggerName: 'Service Catalog',
    steps,
    flowVariables: [],
    ...over,
  };
}

describe('parseDurationSeconds', () => {
  it('parses numeric durations and rejects absolute datetimes', () => {
    expect(parseDurationSeconds('90')).toEqual({ seconds: 90, absolute: false });
    expect(parseDurationSeconds('2026-01-01T12:00:00')).toEqual({ seconds: 0, absolute: true });
  });
});

describe('convertFlow compile branches', () => {
  it('maps catalog_task wait flags and translates ah_fields pills', () => {
    const lookups = emptyLookups({
      actionTypes: new Map([
        ['def_task', { sys_id: 'def_task', name: 'Create Catalog Task', internal_name: 'create_catalog_task' }],
      ]),
      groups: new Map([['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', { sys_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', name: 'Procurement' }]]),
    });
    const notes = new NoteCollector();
    const result = convertFlow(
      flow([
        step({
          uiId: 't1',
          order: 1,
          definitionId: 'def_task',
          values: {
            ah_fields: 'short_description=Order {{trigger.request_item.number}}^description=Ship it',
            ah_assignment_group: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            ah_wait: 'false',
          },
        }),
      ]),
      { lookups, fields: new Map(), notes, isSubflow: false, extractPreApproval: false },
    );
    expect(result.config).not.toBeNull();
    const task = result.config!.states.find((s) => s.type === 'action.task') as {
      wait?: boolean;
      name: string;
      groupTemplate?: string;
    };
    expect(task.wait).toBe(false);
    expect(task.groupTemplate).toBe('Procurement');
    expect(task.name).toContain('request.number');
  });

  it('lifts leading manager approval to preApproval without an in-flow approval state', () => {
    const lookups = emptyLookups({
      actionTypes: new Map([
        ['def_appr', { sys_id: 'def_appr', name: 'Ask For Approval', internal_name: 'ask_for_approval' }],
        ['def_task', { sys_id: 'def_task', name: 'Create Catalog Task', internal_name: 'create_catalog_task' }],
      ]),
    });
    const notes = new NoteCollector();
    const result = convertFlow(
      flow([
        step({
          uiId: 'a1',
          order: 1,
          definitionId: 'def_appr',
          values: { rules: 'Approver is manager of requester' },
        }),
        step({
          uiId: 't1',
          order: 2,
          definitionId: 'def_task',
          values: { ah_short_description: 'Do work', ah_wait: 'true' },
        }),
      ]),
      { lookups, fields: new Map(), notes, isSubflow: false, extractPreApproval: true },
    );
    expect(result.preApproval).toEqual({
      name: expect.any(String),
      approverType: 'requester_manager',
      groupName: null,
    });
    expect(result.config?.states.some((s) => s.type === 'action.approval')).toBe(false);
    expect(notes.notes.some((n) => n.code === 'manager_approval')).toBe(true);
  });

  it('compiles wait duration and skips wait-until datetimes', () => {
    const lookups = emptyLookups({
      logicDefinitions: new Map([
        ['def_wait', { sys_id: 'def_wait', name: 'Wait for a duration', type: 'wait_for_a_duration' }],
      ]),
    });
    const notes = new NoteCollector();
    const ok = convertFlow(
      flow([step({ kind: 'logic', uiId: 'w1', order: 1, definitionId: 'def_wait', values: { duration: '30' } })]),
      { lookups, fields: new Map(), notes, isSubflow: false, extractPreApproval: false },
    );
    expect(ok.config?.states.some((s) => s.type === 'delay' && (s as { delaySeconds: number }).delaySeconds === 30)).toBe(true);

    const notes2 = new NoteCollector();
    const abs = convertFlow(
      flow([
        step({
          kind: 'logic',
          uiId: 'w2',
          order: 1,
          definitionId: 'def_wait',
          values: { duration: '2026-06-01 09:00:00' },
        }),
      ]),
      { lookups, fields: new Map(), notes: notes2, isSubflow: false, extractPreApproval: false },
    );
    expect(abs.config?.states.some((s) => s.type === 'delay')).toBeFalsy();
    expect(notes2.notes.some((n) => n.code === 'wait_until_unsupported')).toBe(true);
  });

  it('notes declared flowVariables without seeding vars', () => {
    const notes = new NoteCollector();
    convertFlow(
      flow([], { flowVariables: [{ name: 'x', label: 'X', type: 'string' }] }),
      { lookups: emptyLookups(), fields: new Map(), notes, isSubflow: false, extractPreApproval: false },
    );
    expect(notes.notes.some((n) => n.code === 'flow_variables')).toBe(true);
  });

  it('returns calledSubflowIds for subflows that stay as calls', () => {
    const lookups = emptyLookups({
      subflowTypes: new Map([['sf1', 'sn_helper']]),
      flows: new Map(),
    });
    const notes = new NoteCollector();
    const result = convertFlow(
      flow([
        step({
          kind: 'subflow',
          uiId: 's1',
          order: 1,
          subflowId: 'sf1',
          values: { foo: 'bar' },
        }),
      ]),
      { lookups, fields: new Map(), notes, isSubflow: false, extractPreApproval: false },
    );
    expect(result.calledSubflowIds).toEqual(['sf1']);
    expect(result.config?.states.some((s) => s.type === 'call.workflow')).toBe(true);
  });
});
