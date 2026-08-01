/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import type { BuilderNodeData } from './types';
import { autoLayoutGraph, serializeWorkflow } from './workflowSerializer';

function n(id: string, label: string, data: Partial<BuilderNodeData> = {}): Node<BuilderNodeData> {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { label, ...data },
  };
}

function e(id: string, source: string, target: string, label?: string): Edge {
  return { id, source, target, label };
}

describe('workflow serializer', () => {
  it('serializes a simple valid graph without validation errors', () => {
    const nodes = [
      n('start-1', 'Start'),
      n('activity-1', 'Send Email', {
        activityName: 'sendEmail',
        timeoutSec: 30,
        retryAttempts: 3,
        retryBackoffSec: 5,
        onError: 'fail',
      }),
      n('end-1', 'End'),
    ];
    const edges = [e('1', 'start-1', 'activity-1'), e('2', 'activity-1', 'end-1')];

    const result = serializeWorkflow({ nodes, edges }, 'email-workflow');
    expect(result.validation.errors).toEqual([]);
    expect(result.workflow.startAt).toBe('start-1');
    expect(result.workflow.states).toHaveLength(3);
  });

  it('requires decision true/false branches', () => {
    const nodes = [
      n('start-1', 'Start'),
      n('decision-1', 'Is High Priority', { condition: 'input.priority==="high"' }),
      n('end-1', 'End'),
    ];
    const edges = [e('1', 'start-1', 'decision-1'), e('2', 'decision-1', 'end-1', 'true')];

    const result = serializeWorkflow({ nodes, edges }, 'decision-workflow');
    expect(result.validation.errors.some((x) => x.includes('Decision "Is High Priority"'))).toBe(true);
  });

  it('detects cycle as validation error', () => {
    const nodes = [
      n('start-1', 'Start'),
      n('activity-1', 'Task A', {
        activityName: 'taskA',
        timeoutSec: 10,
        retryAttempts: 1,
        retryBackoffSec: 0,
        onError: 'fail',
      }),
    ];
    const edges = [e('1', 'start-1', 'activity-1'), e('2', 'activity-1', 'start-1')];
    const result = serializeWorkflow({ nodes, edges }, 'loop');
    expect(result.validation.errors).toContain('Cycles detected. This builder currently requires acyclic graphs.');
  });
});

describe('auto layout', () => {
  it('assigns non-zero positions based on flow levels', () => {
    const nodes = [n('start-1', 'Start'), n('activity-1', 'Do Work'), n('end-1', 'End')];
    const edges = [e('1', 'start-1', 'activity-1'), e('2', 'activity-1', 'end-1')];

    const result = autoLayoutGraph({ nodes, edges });
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[0]!.position.x).not.toBe(0);
    expect(result.nodes[1]!.position.x).toBeGreaterThan(result.nodes[0]!.position.x);
    expect(result.nodes[2]!.position.x).toBeGreaterThan(result.nodes[1]!.position.x);
  });
});
