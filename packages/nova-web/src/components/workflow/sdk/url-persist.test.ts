/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { loadSdkGraphFromConfig, serializeSdkGraphToConfig } from './adapter';
import { parseBuilderFromConfig, serializeBuilderToConfig } from '../unifiedAutomationDesigner.internals';
import { normalizeLoadedDefinition } from '../../../pages/admin/workflow-editor/definition';

describe('automation url persistence', () => {
  it('serializes empty config as default then keeps mutated url', () => {
    const empty = parseBuilderFromConfig({});
    expect(empty.error).toBeUndefined();
    const ser = serializeBuilderToConfig(empty.nodes, empty.edges);
    expect(ser.errors).toEqual([]);
    expect((ser.config?.states as Array<{ url?: string }>)[0]?.url).toContain('httpbin.org');

    const loaded = loadSdkGraphFromConfig({});
    expect(loaded.error).toBeUndefined();
    const ser2 = serializeSdkGraphToConfig(loaded.nodes, loaded.edges);
    expect(ser2.errors).toEqual([]);

    const nodes = structuredClone(loaded.nodes);
    const act = nodes.find((n) => n.data.type === 'activity');
    expect(act).toBeTruthy();
    (act!.data.properties as Record<string, unknown>).url = 'https://httpbin.com/status/200';
    const ser3 = serializeSdkGraphToConfig(nodes, loaded.edges);
    expect(ser3.errors).toEqual([]);
    expect((ser3.config?.states as Array<{ url?: string }>)[0]?.url).toBe('https://httpbin.com/status/200');
  });

  it('normalizeLoadedDefinition keeps automationConfig url through wrapper', () => {
    const draft = {
      kind: 'unified_automation_designer_v1',
      workflowType: 'ticket-triage-workflow',
      automationConfig: {
        kind: 'state_machine',
        schemaVersion: 1,
        startAt: 'activity-1',
        states: [
          {
            id: 'activity-1',
            type: 'activity',
            method: 'GET',
            url: 'https://httpbin.com/status/200',
            transitions: [{ to: 'end-success', when: 'success' }],
          },
          { id: 'end-success', type: 'end', result: 'success' },
        ],
      },
    };
    const normalized = normalizeLoadedDefinition(draft, 'ticket-triage-workflow');
    expect(normalized.automationConfigJson).toContain('httpbin.com');
    const loaded = loadSdkGraphFromConfig(JSON.parse(normalized.automationConfigJson));
    const ser = serializeSdkGraphToConfig(loaded.nodes, loaded.edges);
    expect((ser.config?.states as Array<{ url?: string }>)[0]?.url).toBe('https://httpbin.com/status/200');
  });

  it('normalizeLoadedDefinition repairs empty automationConfig to default', () => {
    const normalized = normalizeLoadedDefinition(
      { kind: 'unified_automation_designer_v1', workflowType: 'x', automationConfig: {} },
      'ticket-triage-workflow',
    );
    expect(normalized.automationConfigJson).toContain('httpbin.org');
  });

  it('normalizeLoadedDefinition falls back to default when wrapper missing', () => {
    const normalized = normalizeLoadedDefinition(
      { kind: 'state_machine', startAt: 'x', states: [] },
      'ticket-triage-workflow',
    );
    expect(normalized.automationConfigJson).toContain('httpbin.org');
  });
});