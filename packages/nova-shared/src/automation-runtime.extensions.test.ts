/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { AUTOMATION_SCHEMA_VERSION, validateAndParseAutomationConfig } from './automation-config';
import { executeAutomationGraph, resolveLoopItems } from './automation-runtime';

function graph(startAt: string, states: Array<Record<string, unknown>>) {
  const parsed = validateAndParseAutomationConfig({
    kind: 'state_machine',
    schemaVersion: AUTOMATION_SCHEMA_VERSION,
    startAt,
    states: [
      ...states,
      { id: 'ok', type: 'end', result: 'success' },
      { id: 'bad', type: 'end', result: 'failure' },
    ],
  });
  expect(parsed.errors).toEqual([]);
  return parsed.config!;
}

const run = (cfg: ReturnType<typeof graph>, extra: Partial<Parameters<typeof executeAutomationGraph>[0]> = {}) =>
  executeAutomationGraph({ cfg, request: { number: 'REQ1', form_data: {} }, credMap: {}, persistFormData: false, ...extra });

const visits = (trace: string[], id: string) => trace.filter((t) => t.split(':')[1] === id).length;

describe('resolveLoopItems', () => {
  it('accepts arrays, JSON arrays and comma-separated strings', () => {
    expect(resolveLoopItems('{{vars.list}}', { vars: { list: [1, 2] } })).toEqual([1, 2]);
    expect(resolveLoopItems('["a","b"]', {})).toEqual(['a', 'b']);
    expect(resolveLoopItems('a, b ,c', {})).toEqual(['a', 'b', 'c']);
    expect(resolveLoopItems('', {})).toEqual([]);
  });
});

describe('variables.set and loop.foreach', () => {
  it('iterates items, exposes loop.<id>.item and keeps vars across iterations', async () => {
    const cfg = graph('init', [
      { id: 'init', type: 'variables.set', assignments: { list: 'mouse,dock,bag', seen: '' }, transitions: [{ to: 'each' }] },
      {
        id: 'each',
        type: 'loop.foreach',
        itemsExpr: '{{vars.list}}',
        transitions: [{ to: 'body', when: 'item' }, { to: 'check', when: 'done' }],
      },
      { id: 'body', type: 'variables.set', assignments: { seen: '{{vars.seen}}{{loop.each.item}};' }, transitions: [{ to: 'each' }] },
      {
        id: 'check',
        type: 'decision.advanced',
        expression: { op: 'eq', left: { var: 'vars.seen' }, right: 'mouse;dock;bag;' },
        transitions: [{ to: 'ok', when: 'true' }, { to: 'bad', when: 'false' }],
      },
    ]);
    const result = await run(cfg);
    expect(result.ok).toBe(true);
    expect(visits(result.trace, 'body')).toBe(3);
    expect(result.stateResults.each).toMatchObject({ iterations: 3 });
  });

  it('stops at maxIterations with a warning', async () => {
    const cfg = graph('each', [
      {
        id: 'each',
        type: 'loop.foreach',
        itemsExpr: '1,2,3,4,5',
        maxIterations: 2,
        transitions: [{ to: 'body', when: 'item' }, { to: 'ok', when: 'done' }],
      },
      { id: 'body', type: 'variables.set', assignments: { last: '{{loop.each.item}}' }, transitions: [{ to: 'each' }] },
    ]);
    const result = await run(cfg);
    expect(result.ok).toBe(true);
    expect(visits(result.trace, 'body')).toBe(2);
    expect(result.warnings.some((w) => w.includes('maxIterations=2'))).toBe(true);
  });

  it('fails when the step budget is exhausted', async () => {
    const cfg = graph('spin', [
      { id: 'spin', type: 'variables.set', assignments: { x: '1' }, transitions: [{ to: 'spin' }] },
    ]);
    const result = await run(cfg, { maxExecutionSteps: 25 });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('max execution steps (25)');
  });
});

describe('parallel.fork / parallel.join', () => {
  it('runs every branch before continuing after the join', async () => {
    const cfg = graph('fork', [
      { id: 'fork', type: 'parallel.fork', joinId: 'join', transitions: [{ to: 'a', when: 'branch' }, { to: 'b', when: 'branch' }] },
      { id: 'a', type: 'variables.set', assignments: { a: 'yes' }, transitions: [{ to: 'join' }] },
      { id: 'b', type: 'variables.set', assignments: { b: 'yes' }, transitions: [{ to: 'join' }] },
      { id: 'join', type: 'parallel.join', transitions: [{ to: 'check' }] },
      {
        id: 'check',
        type: 'decision.advanced',
        expression: {
          op: 'and',
          conditions: [
            { op: 'eq', left: { var: 'vars.a' }, right: 'yes' },
            { op: 'eq', left: { var: 'vars.b' }, right: 'yes' },
          ],
        },
        transitions: [{ to: 'ok', when: 'true' }, { to: 'bad', when: 'false' }],
      },
    ]);
    const result = await run(cfg);
    expect(result.ok).toBe(true);
    expect(visits(result.trace, 'join')).toBe(1);
    expect(result.stateResults.fork).toMatchObject({ branches: 2 });
  });

  it('propagates a failing branch', async () => {
    const cfg = graph('fork', [
      { id: 'fork', type: 'parallel.fork', joinId: 'join', transitions: [{ to: 'a', when: 'branch' }, { to: 'bad', when: 'branch' }] },
      { id: 'a', type: 'variables.set', assignments: { a: 'yes' }, transitions: [{ to: 'join' }] },
      { id: 'join', type: 'parallel.join', transitions: [{ to: 'ok' }] },
    ]);
    expect((await run(cfg)).ok).toBe(false);
  });
});

describe('action.approval', () => {
  const approvalGraph = () => graph('approve', [
    {
      id: 'approve',
      type: 'action.approval',
      approverType: 'group',
      approverTemplate: 'IT Approvers',
      name: 'Approve {{request.number}}',
      transitions: [{ to: 'yes', when: 'approved' }, { to: 'no', when: 'rejected' }],
    },
    { id: 'yes', type: 'variables.set', assignments: { result: '{{state.approve.body.outcome}}' }, transitions: [{ to: 'ok' }] },
    { id: 'no', type: 'variables.set', assignments: { result: 'rejected' }, transitions: [{ to: 'bad' }] },
  ]);

  it('fails outside a fulfillment context', async () => {
    const result = await run(approvalGraph());
    expect(result.ok).toBe(false);
    expect(result.message).toContain('requires a catalog fulfillment context');
  });

  it('auto-approves in dry-run', async () => {
    const result = await run(approvalGraph(), { dryRun: true });
    expect(result.ok).toBe(true);
    expect(result.stateResults.yes).toMatchObject({ body: { result: 'approved' } });
  });

  it('suspends with a checkpoint and resumes on approved or rejected', async () => {
    const cfg = approvalGraph();
    const first = await run(cfg, { allowSuspend: true });
    expect(first.suspended).toBeDefined();
    expect(first.suspended!.approval).toMatchObject({ name: 'Approve REQ1', approverType: 'group', approver: 'IT Approvers' });
    const checkpoint = JSON.parse(JSON.stringify(first.suspended!.checkpoint));

    const approved = await run(cfg, { allowSuspend: true, resume: { checkpoint, outcome: 'approved' } });
    expect(approved.ok).toBe(true);
    expect(approved.suspended).toBeUndefined();
    expect(approved.stateResults.yes).toMatchObject({ body: { result: 'approved' } });

    const rejected = await run(cfg, { allowSuspend: true, resume: { checkpoint, outcome: 'rejected' } });
    expect(rejected.ok).toBe(false);
    expect(visits(rejected.trace, 'no')).toBe(1);
  });

  it('resumes inside a loop without restarting it', async () => {
    const cfg = graph('each', [
      {
        id: 'each',
        type: 'loop.foreach',
        itemsExpr: 'x,y',
        transitions: [{ to: 'approve', when: 'item' }, { to: 'ok', when: 'done' }],
      },
      {
        id: 'approve',
        type: 'action.approval',
        approverType: 'requester_manager',
        transitions: [{ to: 'each', when: 'approved' }, { to: 'bad', when: 'rejected' }],
      },
    ]);
    let result = await run(cfg, { allowSuspend: true });
    let suspensions = 0;
    while (result.suspended) {
      suspensions += 1;
      result = await run(cfg, { allowSuspend: true, resume: { checkpoint: result.suspended.checkpoint, outcome: 'approved' } });
    }
    expect(suspensions).toBe(2);
    expect(result.ok).toBe(true);
  });

  it('rejects approvals inside parallel branches', async () => {
    const cfg = graph('fork', [
      { id: 'fork', type: 'parallel.fork', joinId: 'join', transitions: [{ to: 'approve', when: 'branch' }] },
      {
        id: 'approve',
        type: 'action.approval',
        approverType: 'requester_manager',
        transitions: [{ to: 'join', when: 'approved' }, { to: 'join', when: 'rejected' }],
      },
      { id: 'join', type: 'parallel.join', transitions: [{ to: 'ok' }] },
    ]);
    const result = await run(cfg, { allowSuspend: true });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('parallel branches');
  });
});
