/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { getAutomationConfigFixture, validateAutomationConfig } from '@nova-suite/shared';
import { parseBuilderFromConfig, serializeBuilderToConfig } from './unifiedAutomationDesigner.internals';
import { loadSdkGraphFromConfig, serializeSdkGraphToConfig } from './sdk/adapter';

describe('UnifiedAutomationDesigner contract', () => {
  it('round-trips reusable CI fixture through parse/serialize', () => {
    const fixture = getAutomationConfigFixture('reusableCiFlow');
    const parsed = parseBuilderFromConfig(fixture);
    expect(parsed.error).toBeUndefined();

    const serialized = serializeBuilderToConfig(parsed.nodes, parsed.edges);
    expect(serialized.errors).toEqual([]);
    expect(serialized.config).not.toBeNull();
    expect(validateAutomationConfig(serialized.config)).toEqual([]);
  });

  it('round-trips reusable CI fixture through SDK adapter', () => {
    const fixture = getAutomationConfigFixture('reusableCiFlow');
    const loaded = loadSdkGraphFromConfig(fixture);
    expect(loaded.error).toBeUndefined();
    expect(loaded.nodes.length).toBeGreaterThan(0);

    for (const node of loaded.nodes) {
      expect(node.type).not.toBe('default');
      expect(['node', 'start-node', 'decision-node']).toContain(node.type);
      expect(node.data.icon).toBeTruthy();
      const props = node.data.properties as Record<string, unknown>;
      for (const [key, value] of Object.entries(props)) {
        expect(value, `node ${node.id} property ${key}`).not.toBeUndefined();
      }
    }

    const serialized = serializeSdkGraphToConfig(loaded.nodes, loaded.edges);
    expect(serialized.errors).toEqual([]);
    expect(serialized.config).not.toBeNull();
    expect(validateAutomationConfig(serialized.config)).toEqual([]);
  });

  it('attaches decision branch sourceHandles so true/false edges render', () => {
    const loaded = loadSdkGraphFromConfig({
      kind: 'state_machine',
      schemaVersion: 1,
      startAt: 'gate',
      states: [
        {
          id: 'gate',
          type: 'decision.advanced',
          expression: { op: 'eq', left: { var: 'vars.x' }, right: '1' },
          transitions: [{ to: 'yes', when: 'true' }, { to: 'no', when: 'false' }],
        },
        { id: 'yes', type: 'end', result: 'success' },
        { id: 'no', type: 'end', result: 'failure' },
      ],
    });
    expect(loaded.error).toBeUndefined();
    const fromGate = loaded.edges.filter((e) => e.source === 'gate');
    expect(fromGate).toHaveLength(2);
    for (const edge of fromGate) {
      expect(edge.sourceHandle).toMatch(/^source:inner:/);
      expect(edge.id).toBe(String(edge.sourceHandle).replace(/^source:inner:/, ''));
      expect(['true', 'false']).toContain(edge.data?.label);
    }
    const gate = loaded.nodes.find((n) => n.id === 'gate')!;
    const branches = (gate.data.properties as { decisionBranches?: Array<{ sourceHandle: string; label: string }> })
      .decisionBranches ?? [];
    expect(branches).toHaveLength(2);
    expect(branches.map((b) => b.sourceHandle).sort()).toEqual(
      fromGate.map((e) => e.sourceHandle).sort(),
    );
    const serialized = serializeSdkGraphToConfig(loaded.nodes, loaded.edges);
    expect(serialized.errors).toEqual([]);
    expect(serialized.config).toMatchObject({
      startAt: 'gate',
      states: expect.arrayContaining([
        expect.objectContaining({
          id: 'gate',
          transitions: expect.arrayContaining([
            expect.objectContaining({ when: 'true' }),
            expect.objectContaining({ when: 'false' }),
          ]),
        }),
      ]),
    });
  });

  it('round-trips approval → manual task → advanced decision through SDK adapter', () => {
    const loaded = loadSdkGraphFromConfig({
      kind: 'state_machine',
      schemaVersion: 1,
      startAt: 'approve',
      states: [
        {
          id: 'approve',
          type: 'action.approval',
          name: 'Manager',
          approverType: 'requester_manager',
          transitions: [{ to: 'task', when: 'approved' }, { to: 'end_rejected', when: 'rejected' }],
        },
        {
          id: 'task',
          type: 'action.task',
          name: 'Fulfill',
          instructions: 'Do the work',
          wait: true,
          transitions: [{ to: 'gate', when: 'success' }],
        },
        {
          id: 'gate',
          type: 'decision.advanced',
          expression: { op: 'eq', left: { var: 'vars.flag' }, right: 'yes' },
          transitions: [{ to: 'end_success', when: 'true' }, { to: 'end_rejected', when: 'false' }],
        },
        { id: 'end_success', type: 'end', result: 'success' },
        { id: 'end_rejected', type: 'end', result: 'failure', onFailure: { rejectRequest: true } },
      ],
    });
    expect(loaded.error).toBeUndefined();
    const fromGate = loaded.edges.filter((e) => e.source === 'gate');
    expect(fromGate).toHaveLength(2);
    for (const edge of fromGate) {
      expect(edge.sourceHandle).toMatch(/^source:inner:/);
    }
    const serialized = serializeSdkGraphToConfig(loaded.nodes, loaded.edges);
    expect(serialized.errors).toEqual([]);
    expect(validateAutomationConfig(serialized.config)).toEqual([]);
    const types = (serialized.config?.states as Array<{ type: string }>).map((s) => s.type);
    expect(types).toEqual(expect.arrayContaining([
      'action.approval',
      'action.task',
      'decision.advanced',
    ]));
    const gate = (serialized.config?.states as Array<{ id: string; transitions?: Array<{ when?: string }> }>)
      .find((s) => s.id === 'gate');
    expect(gate?.transitions?.map((t) => t.when).sort()).toEqual(['false', 'true']);
  });

  it('round-trips stub library nodes through SDK adapter', () => {
    const fixture = getAutomationConfigFixture('stubLibraryNodes');
    const loaded = loadSdkGraphFromConfig(fixture);
    expect(loaded.error).toBeUndefined();

    const serialized = serializeSdkGraphToConfig(loaded.nodes, loaded.edges);
    expect(serialized.errors).toEqual([]);
    expect(serialized.config).not.toBeNull();
    expect(validateAutomationConfig(serialized.config)).toEqual([]);
    const types = (serialized.config?.states as Array<{ type: string }>).map((s) => s.type);
    expect(types).toEqual(expect.arrayContaining([
      'action.notification',
      'action.ticket',
      'action.assign',
      'action.script',
      'call.workflow',
    ]));
  });
});
