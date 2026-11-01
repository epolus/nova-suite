/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { validateAutomationConfig } from '../../automation-config';
import type { LegacyWorkflow } from './snapshot';
import { convertLegacyWorkflow } from './transform/legacy';
import { NoteCollector } from './transform/report';
import type { FlowLookups } from './transform/flow';

const GROUP = 'a'.repeat(32);

function lookups(): FlowLookups {
  return {
    actionTypes: new Map(),
    logicDefinitions: new Map(),
    groups: new Map([[GROUP, { sys_id: GROUP, name: 'Field Services' }]]),
    users: new Map(),
    subflowTypes: new Map(),
    flows: new Map(),
    calledSubflows: new Set(),
  };
}

function workflow(): LegacyWorkflow {
  return {
    sys_id: 'wf1',
    name: 'Hardware request',
    description: '',
    table: 'sc_req_item',
    versionId: 'ver1',
    activities: [
      { sysId: 'b', name: 'Begin', definitionName: 'Begin', x: 0, y: 0, values: {} },
      { sysId: 'a', name: 'Requested Item Dept Head Approval', definitionName: 'Approval - User', x: 1, y: 0, values: {} },
      {
        sysId: 't',
        name: 'Order hardware',
        definitionName: 'Catalog Task',
        x: 2,
        y: 0,
        values: {
          short_description: 'Ship to ${current.requested_for.email}',
          description: 'Opened ${current.opened_at}. Qty ${current.quantity}. ${current.comments}',
          assignment_group: GROUP,
          wait_for_completion: 'true',
        },
      },
      { sysId: 'e', name: 'End', definitionName: 'End', x: 3, y: 0, values: {} },
    ],
    transitions: [
      { from: 'b', to: 'a', name: '', condition: '' },
      { from: 'a', to: 't', name: 'Approved', condition: '' },
      { from: 'a', to: 'e', name: 'Rejected', condition: '' },
      { from: 't', to: 'e', name: '', condition: '' },
    ],
  };
}

describe('convertLegacyWorkflow', () => {
  it('maps dept-head approval and catalog task pills', () => {
    const notes = new NoteCollector();
    const result = convertLegacyWorkflow(workflow(), {
      lookups: lookups(),
      fields: new Map(),
      notes,
      extractPreApproval: true,
    });
    expect(result.config).not.toBeNull();
    expect(validateAutomationConfig(result.config)).toEqual([]);
    const approval = result.config!.states.find((s) => s.type === 'action.approval') as { approverType?: string };
    expect(approval.approverType).toBe('department_manager');
    const task = result.config!.states.find((s) => s.type === 'action.task') as {
      name: string;
      instructions?: string;
      groupTemplate?: string;
    };
    expect(task.groupTemplate).toBe('Field Services');
    expect(task.name).toContain('request.requested_for_email');
    expect(task.instructions).toContain('request.created_at');
    expect(task.instructions).toContain('request.quantity');
    expect(task.instructions).toContain('request.notes');
    expect(notes.notes.some((n) => n.code === 'approval_rules_unparsed')).toBe(false);
    expect(result.config!.startAt).not.toBe('end_success');
  });
});
