/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Edge, Node } from '@xyflow/react';
import { resolveBuilderNodeType, type UnifiedBuilderNodeData } from './unifiedAutomationDesigner.internals';

const COL = 280;
const ROW = 160;
const BRANCH_GAP = 48;

type OutEdge = { target: string; label: string };

/** Prefer the happy path first so it stays on a straight horizontal spine. */
function branchOrder(label: string): number {
  const l = label.toLowerCase();
  if (l === 'approved' || l === 'true' || l === 'success' || l === 'item' || l === '') return 0;
  if (l === 'rejected' || l === 'false' || l === 'done' || l === 'failure' || l === 'error') return 2;
  return 1;
}

function edgeLabel(edge: Edge): string {
  if (typeof edge.label === 'string') return edge.label;
  const data = edge.data as { label?: unknown } | undefined;
  return typeof data?.label === 'string' ? data.label : '';
}

/**
 * Left-to-right layout that keeps the primary branch flat and stacks alternate
 * branches (rejected / false / …) below it. Join nodes are pushed past every parent.
 */
export function autoLayoutBuilderGraph(
  nodes: Node<UnifiedBuilderNodeData>[],
  edges: Edge[],
): Node<UnifiedBuilderNodeData>[] {
  const startNode = nodes.find((n) => resolveBuilderNodeType(n) === 'start');
  if (!startNode) return nodes;

  const outs = new Map<string, OutEdge[]>();
  const ins = new Map<string, string[]>();
  for (const edge of edges) {
    const list = outs.get(edge.source) ?? [];
    list.push({ target: edge.target, label: edgeLabel(edge) });
    outs.set(edge.source, list);
    const parents = ins.get(edge.target) ?? [];
    parents.push(edge.source);
    ins.set(edge.target, parents);
  }
  for (const list of outs.values()) {
    list.sort((a, b) => branchOrder(a.label) - branchOrder(b.label) || a.target.localeCompare(b.target));
  }

  const pos = new Map<string, { x: number; y: number }>();
  const placed = new Set<string>();

  const layoutSubtree = (id: string, depth: number, y: number): { top: number; bottom: number } => {
    if (placed.has(id)) {
      const existing = pos.get(id)!;
      // A later, longer branch may need this join further to the right.
      existing.x = Math.max(existing.x, 80 + depth * COL);
      return { top: existing.y, bottom: existing.y + ROW };
    }
    placed.add(id);
    pos.set(id, { x: 80 + depth * COL, y });

    const children = [...new Set((outs.get(id) ?? []).map((o) => o.target))];
    if (children.length === 0) return { top: y, bottom: y + ROW };

    const only = children.length === 1 ? children[0] : undefined;
    if (only) {
      const child = layoutSubtree(only, depth + 1, y);
      return { top: Math.min(y, child.top), bottom: Math.max(y + ROW, child.bottom) };
    }

    // First child continues the spine at the same y; other branches stack below.
    let top = y;
    let bottom = y + ROW;
    let nextY = y;
    children.forEach((childId, index) => {
      const childY = index === 0 ? y : nextY;
      const child = layoutSubtree(childId, depth + 1, childY);
      top = Math.min(top, child.top);
      bottom = Math.max(bottom, child.bottom);
      nextY = child.bottom + BRANCH_GAP;
    });
    return { top, bottom };
  };

  layoutSubtree(startNode.id, 0, 80);

  // Push join nodes to the right of every parent so back-edges don't cut through the graph.
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let moved = false;
    for (const n of nodes) {
      const parents = ins.get(n.id);
      const p = pos.get(n.id);
      if (!parents || parents.length < 2 || !p) continue;
      const minX = Math.max(...parents.map((pid) => (pos.get(pid)?.x ?? 0) + COL));
      if (minX > p.x) {
        p.x = minX;
        moved = true;
      }
    }
    if (!moved) break;
  }

  let orphanY = 80;
  for (const n of nodes) {
    if (!pos.has(n.id)) {
      pos.set(n.id, { x: 80, y: orphanY });
      orphanY += ROW;
    }
  }

  return nodes.map((n) => ({
    ...n,
    position: pos.get(n.id) ?? n.position,
  }));
}
