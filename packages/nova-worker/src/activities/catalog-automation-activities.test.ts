/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { getAutomationConfigFixture } from '@nova-suite/shared';
import { __test__ } from './catalog-automation-activities';

describe('catalog automation v2 helpers', () => {
  it('evaluates advanced expressions with state context', () => {
    const ok = __test__.evaluateAdvancedCondition(
      {
        op: 'and',
        conditions: [
          { op: 'gt', left: { var: 'state.lookup.body.count' }, right: 0 },
          { op: 'eq', left: { var: 'request.form_data.asset_tag' }, right: 'LAP-123' },
        ],
      },
      {
        request: { form_data: { asset_tag: 'LAP-123' } },
        state: { lookup: { body: { count: 1 } } },
      },
    );
    expect(ok).toBe(true);
  });

  it('builds ci.lookup action payload with request context', () => {
    const cfg = getAutomationConfigFixture('reusableCiFlow');
    const lookup = (cfg.states as Array<Record<string, unknown>>).find((s) => s.id === 'lookup');
    if (!lookup) throw new Error('lookup state missing from fixture');
    const lookupState = lookup as unknown as Parameters<typeof __test__.toHttpActivityState>[0];
    const state = __test__.toHttpActivityState(
      lookupState,
      { request: { id: 'req-1', form_data: { asset_tag: 'LAP-900' } } },
    );
    expect(state.method).toBe('POST');
    expect(state.body).toContain('"request_id":"req-1"');
    expect(state.body).toContain('"asset_tag":"LAP-900"');
  });

  it('builds ci.create action payload with interpolated fields', () => {
    const cfg = getAutomationConfigFixture('reusableCiFlow');
    const create = (cfg.states as Array<Record<string, unknown>>).find((s) => s.id === 'create');
    if (!create) throw new Error('create state missing from fixture');
    const createState = create as unknown as Parameters<typeof __test__.toHttpActivityState>[0];
    const state = __test__.toHttpActivityState(
      createState,
      { request: { id: 'req-2', form_data: { asset_tag: 'LAP-42', serial: 'S42' } } },
    );
    expect(state.method).toBe('POST');
    expect(state.body).toContain('"class_name":"laptop"');
    expect(state.body).toContain('"name":"LAP-42"');
    expect(state.body).toContain('"serial_number":"S42"');
  });

  it('creates an in-flow manual task under the automated task', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes('FROM assignment_groups')) return { rows: [{ id: 'g-1' }] };
        if (sql.includes('FROM users')) return { rows: [] };
        if (sql.includes('nextval')) return { rows: [{ nextval: 42 }] };
        return { rows: [{ id: 'task-9' }] };
      },
    };
    const id = await __test__.createInFlowManualTask(
      client as unknown as Parameters<typeof __test__.createInFlowManualTask>[0],
      'tenant-1',
      'req-1',
      'parent-1',
      3,
      { name: 'Order REQ1', instructions: 'Place the order', group: 'Procurement', assignee: 'nobody@example.com', wait: true },
    );
    expect(id).toBe('task-9');
    expect(calls[0].params).toEqual(['tenant-1', null, 'Procurement']);
    const insert = calls.find((c) => c.sql.includes('INSERT INTO request_tasks'))!;
    expect(insert.params).toEqual([
      'tenant-1', 'TASK0000042', 'req-1', 'parent-1', 3, 'Order REQ1', 'Place the order', null, 'g-1',
      'in_progress', null, 'Assignee "nobody@example.com" not found.',
    ]);
  });

  it('marks non-waiting in-flow manual tasks completed immediately', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes('FROM assignment_groups')) return { rows: [] };
        if (sql.includes('FROM users')) return { rows: [] };
        if (sql.includes('nextval')) return { rows: [{ nextval: 7 }] };
        return { rows: [{ id: 'task-nofollow' }] };
      },
    };
    await __test__.createInFlowManualTask(
      client as unknown as Parameters<typeof __test__.createInFlowManualTask>[0],
      'tenant-1',
      'req-1',
      'parent-1',
      2,
      { name: 'Notify only', instructions: '', group: '', assignee: '', wait: false },
    );
    const insert = calls.find((c) => c.sql.includes('INSERT INTO request_tasks'))!;
    expect(insert.params[9]).toBe('completed');
    expect(insert.params[10]).toBeInstanceOf(Date);
    expect(String(insert.params[11])).toContain('without waiting');
  });

  it('assigns a department-manager approval to the subject department manager', async () => {
    const client = {
      query: async (sql: string) => {
        if (sql.includes('FROM users u')) return { rows: [{ manager_id: 'mgr-1' }] };
        return { rows: [] };
      },
    };
    const assignee = await __test__.resolveApprovalAssignee(
      client as unknown as Parameters<typeof __test__.resolveApprovalAssignee>[0],
      'tenant-1',
      { requester_id: 'user-1', requested_for: null },
      { name: 'Dept head', instructions: '', approverType: 'department_manager', approver: '' },
    );
    expect(assignee).toEqual({ assignedTo: 'mgr-1', assignedGroupId: null, note: null });
  });
});
