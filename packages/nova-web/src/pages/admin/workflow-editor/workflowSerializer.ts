/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Edge, Node } from '@xyflow/react';
import type {
  BuilderGraph,
  BuilderNodeData,
  BuilderNodeType,
  SerializedWorkflow,
  TemporalState,
} from './types';

const validNodeTypes: BuilderNodeType[] = ['start', 'activity', 'decision', 'delay', 'end'];

export function getNodeType(node: Node<BuilderNodeData>): BuilderNodeType {
  const prefix = node.id.split('-')[0] as BuilderNodeType;
  if (validNodeTypes.includes(prefix)) return prefix;
  const fromLabel = node.data.label.toLowerCase() as BuilderNodeType;
  if (validNodeTypes.includes(fromLabel)) return fromLabel;
  return 'activity';
}

function edgeLabel(label: Edge['label']): string | undefined {
  return typeof label === 'string' ? label : undefined;
}

export function serializeWorkflow(
  graph: BuilderGraph,
  workflowType: string,
): SerializedWorkflow {
  const { nodes, edges } = graph;
  const errors: string[] = [];
  const warnings: string[] = [];

  const startNodes = nodes.filter((node) => getNodeType(node) === 'start');
  if (startNodes.length !== 1) {
    errors.push('Exactly one Start node is required.');
  }

  const stateById = new Map(nodes.map((node) => [node.id, node]));
  const startAt = startNodes[0]?.id ?? null;

  const states: TemporalState[] = nodes.map((node) => {
    const nodeType = getNodeType(node);
    const transitions = edges
      .filter((edge) => edge.source === node.id)
      .map((edge) => ({
        to: edge.target,
        when: edgeLabel(edge.label),
      }));

    if (nodeType !== 'end' && transitions.length === 0) {
      errors.push(`Node "${node.data.label}" has no outgoing transition.`);
    }
    if (nodeType === 'start' && transitions.length > 1) {
      errors.push(`Start "${node.data.label}" must have a single outgoing transition.`);
    }
    if (nodeType === 'decision') {
      const labels = transitions.map((transition) => transition.when).filter(Boolean);
      const hasTrue = labels.includes('true');
      const hasFalse = labels.includes('false');
      if (!hasTrue || !hasFalse || transitions.length !== 2) {
        errors.push(`Decision "${node.data.label}" must have exactly true and false branches.`);
      }
    }
    if (nodeType === 'activity') {
      if (!node.data.activityName?.trim()) {
        errors.push(`Activity "${node.data.label}" must define activityName.`);
      }
      if (!node.data.timeoutSec || node.data.timeoutSec < 1) {
        errors.push(`Activity "${node.data.label}" must have timeoutSec >= 1.`);
      }
      if (!node.data.retryAttempts || node.data.retryAttempts < 1) {
        errors.push(`Activity "${node.data.label}" must have retryAttempts >= 1.`);
      }
      if (node.data.retryBackoffSec === undefined || node.data.retryBackoffSec < 0) {
        errors.push(`Activity "${node.data.label}" must have retryBackoffSec >= 0.`);
      }
      if (node.data.onError === 'fallback') {
        if (!node.data.fallbackNodeId) {
          errors.push(`Activity "${node.data.label}" fallback requires fallbackNodeId.`);
        } else if (!stateById.has(node.data.fallbackNodeId)) {
          errors.push(`Activity "${node.data.label}" fallbackNodeId points to missing node.`);
        }
      }
    }

    return {
      id: node.id,
      name: node.data.label,
      type: nodeType,
      activityName: node.data.activityName,
      timeoutSec: node.data.timeoutSec,
      retryAttempts: node.data.retryAttempts,
      retryBackoffSec: node.data.retryBackoffSec,
      onError: node.data.onError,
      fallbackNodeId: node.data.fallbackNodeId,
      condition: node.data.condition,
      delaySeconds: node.data.delaySeconds,
      transitions,
    };
  });

  for (const edge of edges) {
    if (!stateById.has(edge.target)) {
      errors.push(`Edge "${edge.id}" points to a missing target node.`);
    }
  }

  if (startAt) {
    const reachable = new Set<string>([startAt]);
    const queue: string[] = [startAt];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      for (const edge of edges) {
        if (edge.source === current && !reachable.has(edge.target)) {
          reachable.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
    for (const node of nodes) {
      if (!reachable.has(node.id)) {
        errors.push(`Node "${node.data.label}" is not reachable from Start.`);
      }
    }
  }

  if (hasCycle(nodes, edges)) {
    errors.push('Cycles detected. This builder currently requires acyclic graphs.');
  }

  if (workflowType.trim() === '') {
    errors.push('Workflow type is required.');
  }
  if (states.length === 0) {
    errors.push('At least one state is required.');
  }
  if (states.length > 40) {
    warnings.push('Large workflow: consider splitting into child workflows.');
  }

  return {
    workflow: {
      schemaVersion: 1,
      workflowType,
      startAt,
      states,
      warnings,
    },
    validation: { errors, warnings },
  };
}

export function autoLayoutGraph(graph: BuilderGraph): BuilderGraph {
  const { nodes, edges } = graph;
  if (nodes.length === 0) return graph;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, string[]>();
  for (const node of nodes) outgoing.set(node.id, []);
  for (const edge of edges) {
    const list = outgoing.get(edge.source);
    if (list) list.push(edge.target);
  }

  const start = nodes.find((node) => getNodeType(node) === 'start') ?? nodes[0];
  if (!start) return graph;
  const visited = new Set<string>();
  const levelById = new Map<string, number>();
  const queue: Array<{ id: string; level: number }> = [{ id: start.id, level: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);
    levelById.set(current.id, current.level);
    const next = outgoing.get(current.id) ?? [];
    for (const id of next) {
      queue.push({ id, level: current.level + 1 });
    }
  }

  let spillLevel = (Math.max(...Array.from(levelById.values()), 0) || 0) + 1;
  for (const node of nodes) {
    if (!levelById.has(node.id)) {
      levelById.set(node.id, spillLevel);
      spillLevel += 1;
    }
  }

  const groups = new Map<number, string[]>();
  for (const [id, level] of levelById.entries()) {
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level)!.push(id);
  }

  const horizontalGap = 280;
  const verticalGap = 140;

  const nextNodes = nodes.map((node) => {
    const level = levelById.get(node.id) ?? 0;
    const peers = groups.get(level) ?? [node.id];
    const index = peers.indexOf(node.id);
    const yOffset = (peers.length - 1) * verticalGap * 0.5;
    return {
      ...node,
      position: {
        x: 80 + level * horizontalGap,
        y: 120 + index * verticalGap - yOffset,
      },
    };
  });

  for (const node of nextNodes) {
    byId.set(node.id, node);
  }

  return { nodes: nextNodes, edges };
}

function hasCycle(nodes: Node<BuilderNodeData>[], edges: Edge[]): boolean {
  const graph = new Map<string, string[]>();
  const state = new Map<string, 'visiting' | 'visited'>();
  for (const node of nodes) graph.set(node.id, []);
  for (const edge of edges) {
    if (graph.has(edge.source) && graph.has(edge.target)) {
      graph.get(edge.source)!.push(edge.target);
    }
  }

  const visit = (id: string): boolean => {
    const current = state.get(id);
    if (current === 'visiting') return true;
    if (current === 'visited') return false;
    state.set(id, 'visiting');
    for (const target of graph.get(id) ?? []) {
      if (visit(target)) return true;
    }
    state.set(id, 'visited');
    return false;
  };

  for (const id of graph.keys()) {
    if (!state.has(id) && visit(id)) return true;
  }
  return false;
}
