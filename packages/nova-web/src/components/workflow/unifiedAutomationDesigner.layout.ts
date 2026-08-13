/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Edge, Node } from '@xyflow/react';
import { resolveBuilderNodeType, type UnifiedBuilderNodeData } from './unifiedAutomationDesigner.internals';

export function autoLayoutBuilderGraph(
  nodes: Node<UnifiedBuilderNodeData>[],
  edges: Edge[],
): Node<UnifiedBuilderNodeData>[] {
  const startNode = nodes.find((n) => resolveBuilderNodeType(n) === 'start');
  if (!startNode) return nodes;
  const levelById = new Map<string, number>([[startNode.id, 0]]);
  const queue: string[] = [startNode.id];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const currentLevel = levelById.get(current) ?? 0;
    for (const e of edges.filter((edge) => edge.source === current)) {
      if (!levelById.has(e.target)) {
        levelById.set(e.target, currentLevel + 1);
        queue.push(e.target);
      }
    }
  }
  const rowsByLevel = new Map<number, number>();
  return nodes.map((n) => {
    const level = levelById.get(n.id) ?? 1;
    const row = rowsByLevel.get(level) ?? 0;
    rowsByLevel.set(level, row + 1);
    return {
      ...n,
      position: { x: 80 + level * 280, y: 80 + row * 170 },
    };
  });
}
