/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { autoLayoutBuilderGraph } from './unifiedAutomationDesigner.layout';
import type { UnifiedBuilderNodeData } from './unifiedAutomationDesigner.internals';

function node(id: string, nodeType = id): Node<UnifiedBuilderNodeData> {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { label: id, nodeType: nodeType as UnifiedBuilderNodeData['nodeType'] },
  };
}

function edge(source: string, target: string, label?: string): Edge {
  return { id: `${source}->${target}:${label ?? ''}`, source, target, label };
}

describe('autoLayoutBuilderGraph', () => {
  it('keeps the happy path flat and stacks the reject / false branches below', () => {
    const nodes = [
      node('start', 'start'),
      node('approve', 'action.approval'),
      node('end_rejected', 'end'),
      node('task', 'action.task'),
      node('if', 'decision.advanced'),
      node('email_true', 'action.notification'),
      node('task_true', 'action.task'),
      node('email_false', 'action.notification'),
      node('task_false', 'action.task'),
      node('end_success', 'end'),
    ];
    const edges = [
      edge('start', 'approve'),
      edge('approve', 'task', 'approved'),
      edge('approve', 'end_rejected', 'rejected'),
      edge('task', 'if', 'success'),
      edge('if', 'email_true', 'true'),
      edge('if', 'email_false', 'false'),
      edge('email_true', 'task_true', 'success'),
      edge('task_true', 'end_success', 'success'),
      edge('email_false', 'task_false', 'success'),
      edge('task_false', 'end_success', 'success'),
    ];

    const laid = autoLayoutBuilderGraph(nodes, edges);
    const at = (id: string) => {
      const p = laid.find((n) => n.id === id)?.position;
      if (!p) throw new Error(`missing ${id}`);
      return p;
    };

    // Main spine shares one y.
    expect(at('start').y).toBe(at('approve').y);
    expect(at('approve').y).toBe(at('task').y);
    expect(at('task').y).toBe(at('if').y);
    expect(at('if').y).toBe(at('email_true').y);
    expect(at('email_true').y).toBe(at('task_true').y);

    // Alternate branches sit below the spine.
    expect(at('end_rejected').y).toBeGreaterThan(at('approve').y);
    expect(at('email_false').y).toBeGreaterThan(at('if').y);
    expect(at('task_false').y).toBe(at('email_false').y);

    // Left-to-right progression on the spine; join is to the right of both branch tips.
    expect(at('approve').x).toBeGreaterThan(at('start').x);
    expect(at('task').x).toBeGreaterThan(at('approve').x);
    expect(at('end_success').x).toBeGreaterThanOrEqual(at('task_true').x);
    expect(at('end_success').x).toBeGreaterThanOrEqual(at('task_false').x);
  });
});
