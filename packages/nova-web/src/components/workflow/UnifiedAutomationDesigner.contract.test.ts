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
