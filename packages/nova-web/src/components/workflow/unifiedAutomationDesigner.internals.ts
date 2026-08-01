/* SPDX-License-Identifier: AGPL-3.0-only */
import { MarkerType } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import {
  AUTOMATION_SCHEMA_VERSION,
  AUTOMATION_STATE_TYPES,
  isUnifiedBuilderNodeType,
  UNIFIED_BUILDER_DEFAULT_AUTOMATION_CONFIG,
  UNIFIED_BUILDER_PARSE_FALLBACK_EXPRESSION,
} from '@nova-suite/shared';
import type { AutomationStateType, UnifiedBuilderNodeType } from '@nova-suite/shared';

export type BuilderError = {
  code: string;
  params?: Record<string, string | number>;
};

export const UNIFIED_PALETTE_TYPES: UnifiedBuilderNodeType[] = [
  'start',
  'activity',
  'decision',
  'delay',
  'end',
  'action.rest',
  'action.ci.lookup',
  'action.ci.create',
  'decision.advanced',
];

/** i18n keys under `components.unifiedAutomationDesigner.nodeTypes` (dots in type ids are not valid message paths). */
export const UNIFIED_NODE_TYPE_MESSAGE_KEYS: Record<UnifiedBuilderNodeType, string> = {
  start: 'start',
  activity: 'activity',
  decision: 'decision',
  delay: 'delay',
  end: 'end',
  'action.rest': 'actionRest',
  'action.ci.lookup': 'actionCiLookup',
  'action.ci.create': 'actionCiCreate',
  'decision.advanced': 'decisionAdvanced',
};

export type UnifiedBuilderNodeData = {
  label: string;
  nodeType?: UnifiedBuilderNodeType;
  method?: string;
  url?: string;
  condition?: string;
  delaySeconds?: number;
  retryAttempts?: number;
  retryBackoffSec?: number;
  onError?: 'fail' | 'continue' | 'fallback';
  fallbackNodeId?: string;
  endResult?: 'success' | 'failure';
  className?: string;
  ciName?: string;
  displayName?: string;
  attributesJson?: string;
  expressionJson?: string;
};

export function resolveBuilderNodeType(node: Node<UnifiedBuilderNodeData>): UnifiedBuilderNodeType {
  if (node.data.nodeType) return node.data.nodeType;
  const prefix = node.id.split('-')[0] ?? '';
  if (isUnifiedBuilderNodeType(prefix)) {
    return prefix;
  }
  const label = (node.data.label || '').trim().toLowerCase();
  if (isUnifiedBuilderNodeType(label)) {
    return label;
  }
  return 'activity';
}

export function nextBuilderId(prefix: UnifiedBuilderNodeType): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9]+/g, '_');
  return `${safePrefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseBuilderFromConfig(raw: Record<string, unknown>): {
  nodes: Node<UnifiedBuilderNodeData>[];
  edges: Edge[];
  error?: BuilderError;
} {
  if (Object.keys(raw).length === 0) {
    return parseBuilderFromConfig(UNIFIED_BUILDER_DEFAULT_AUTOMATION_CONFIG);
  }
  if (raw.kind !== 'state_machine') return { nodes: [], edges: [], error: { code: 'kindMustBeStateMachine' } };
  if (raw.schemaVersion !== AUTOMATION_SCHEMA_VERSION) {
    return { nodes: [], edges: [], error: { code: 'schemaVersionMustBe', params: { version: AUTOMATION_SCHEMA_VERSION } } };
  }
  const startAt = typeof raw.startAt === 'string' ? raw.startAt : '';
  const states = Array.isArray(raw.states) ? raw.states as Array<Record<string, unknown>> : [];
  if (!startAt || states.length === 0) return { nodes: [], edges: [], error: { code: 'startAtStatesRequired' } };

  const nodes: Node<UnifiedBuilderNodeData>[] = [
    {
      id: 'start-1',
      type: 'default',
      position: { x: 80, y: 240 },
      data: { label: 'Start', nodeType: 'start' },
    },
  ];
  const edges: Edge[] = [];
  const byId = new Set(states.map((s) => String(s.id || '')));
  if (!byId.has(startAt)) return { nodes: [], edges: [], error: { code: 'startAtMissingState' } };
  edges.push({
    id: `start-1->${startAt}`,
    source: 'start-1',
    target: startAt,
    markerEnd: { type: MarkerType.ArrowClosed },
  });

  let idx = 0;
  for (const s of states) {
    const id = String(s.id || '');
    const type = String(s.type || '');
    if (!id || !AUTOMATION_STATE_TYPES.includes(type as AutomationStateType)) continue;
    const t = type as Exclude<UnifiedBuilderNodeType, 'start'>;
    nodes.push({
      id,
      type: 'default',
      position: { x: 360 + (idx % 3) * 260, y: 80 + Math.floor(idx / 3) * 180 },
      data: {
        label: id,
        nodeType: t,
        method: typeof s.method === 'string' ? s.method : 'GET',
        url: typeof s.url === 'string' ? s.url : '',
        condition: typeof s.condition === 'string' ? s.condition : '{{response.status}}',
        delaySeconds: typeof s.delaySeconds === 'number' ? s.delaySeconds : 5,
        retryAttempts: typeof s.retryAttempts === 'number' ? s.retryAttempts : 1,
        retryBackoffSec: typeof s.retryBackoffSec === 'number' ? s.retryBackoffSec : 0,
        onError: (s.onError === 'continue' || s.onError === 'fallback' ? s.onError : 'fail'),
        fallbackNodeId: typeof s.fallbackNodeId === 'string' ? s.fallbackNodeId : undefined,
        endResult: s.result === 'failure' ? 'failure' : 'success',
        className: typeof s.className === 'string' ? s.className : '',
        ciName: typeof s.name === 'string' ? s.name : '',
        displayName: typeof s.displayName === 'string' ? s.displayName : '',
        attributesJson: JSON.stringify(
          s.attributes && typeof s.attributes === 'object' && !Array.isArray(s.attributes) ? s.attributes : {},
          null,
          2,
        ),
        expressionJson: JSON.stringify(
          s.expression && typeof s.expression === 'object' && !Array.isArray(s.expression)
            ? s.expression
            : UNIFIED_BUILDER_PARSE_FALLBACK_EXPRESSION,
          null,
          2,
        ),
      },
    });
    idx += 1;

    const transitions = Array.isArray(s.transitions) ? s.transitions as Array<Record<string, unknown>> : [];
    for (const tr of transitions) {
      if (typeof tr.to !== 'string' || !tr.to) continue;
      edges.push({
        id: `${id}->${tr.to}:${String(tr.when || '')}`,
        source: id,
        target: tr.to,
        label: typeof tr.when === 'string' && tr.when ? tr.when : undefined,
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }
  }

  return { nodes, edges };
}

export function serializeBuilderToConfig(
  nodes: Node<UnifiedBuilderNodeData>[],
  edges: Edge[],
): { config: Record<string, unknown> | null; errors: BuilderError[] } {
  const errors: BuilderError[] = [];
  const startNodes = nodes.filter((n) => resolveBuilderNodeType(n) === 'start');
  if (startNodes.length !== 1) errors.push({ code: 'exactlyOneStartRequired' });
  const startNode = startNodes[0];
  const fromStart = startNode ? edges.filter((e) => e.source === startNode.id) : [];
  if (!startNode || fromStart.length !== 1 || !fromStart[0]?.target) {
    errors.push({ code: 'startOneOutgoingRequired' });
  }
  const startAt = fromStart[0]?.target;

  const byId = new Set(nodes.map((n) => n.id));
  const states: Array<Record<string, unknown>> = [];
  for (const n of nodes) {
    const t = resolveBuilderNodeType(n);
    if (t === 'start') continue;
    const transitions = edges
      .filter((e) => e.source === n.id)
      .map((e) => ({
        to: e.target,
        ...(typeof e.label === 'string' && e.label ? { when: e.label } : {}),
      }));
    if (t !== 'end' && transitions.length === 0) {
      errors.push({ code: 'nodeNoOutgoing', params: { label: n.data.label } });
    }
    if (t === 'decision' || t === 'decision.advanced') {
      const labels = new Set(transitions.map((tr) => String((tr as { when?: string }).when || '')));
      if (!labels.has('true') || !labels.has('false')) {
        errors.push({ code: 'decisionNeedsTrueFalse', params: { label: n.data.label } });
      }
    }
    for (const tr of transitions) {
      if (!byId.has(tr.to)) errors.push({ code: 'transitionMissingTarget', params: { fromId: n.id, toId: tr.to } });
    }

    if (t === 'activity' || t === 'action.rest') {
      if (!n.data.url || !n.data.url.trim()) errors.push({ code: 'activityRequiresUrl', params: { label: n.data.label } });
      states.push({
        id: n.id,
        type: t,
        method: n.data.method || 'GET',
        url: n.data.url || '',
        retryAttempts: n.data.retryAttempts ?? 1,
        retryBackoffSec: n.data.retryBackoffSec ?? 0,
        onError: n.data.onError || 'fail',
        ...(n.data.fallbackNodeId ? { fallbackNodeId: n.data.fallbackNodeId } : {}),
        transitions,
      });
    } else if (t === 'decision') {
      states.push({
        id: n.id,
        type: 'decision',
        condition: n.data.condition || '{{response.status}}',
        transitions,
      });
    } else if (t === 'decision.advanced') {
      let expression: unknown = { op: 'eq', left: { var: 'response.status' }, right: 200 };
      try {
        expression = JSON.parse(n.data.expressionJson || '{}');
      } catch {
        errors.push({ code: 'decisionInvalidExpression', params: { label: n.data.label } });
      }
      states.push({
        id: n.id,
        type: 'decision.advanced',
        expression,
        transitions,
      });
    } else if (t === 'delay') {
      states.push({
        id: n.id,
        type: 'delay',
        delaySeconds: n.data.delaySeconds ?? 5,
        transitions,
      });
    } else if (t === 'end') {
      states.push({
        id: n.id,
        type: 'end',
        result: n.data.endResult || 'success',
      });
    } else if (t === 'action.ci.lookup') {
      let attributes: unknown = {};
      try {
        attributes = JSON.parse(n.data.attributesJson || '{}');
      } catch {
        errors.push({ code: 'actionInvalidAttributes', params: { label: n.data.label } });
      }
      states.push({
        id: n.id,
        type: 'action.ci.lookup',
        url: n.data.url || '',
        className: n.data.className || '',
        attributes,
        transitions,
      });
    } else if (t === 'action.ci.create') {
      let attributes: unknown = {};
      try {
        attributes = JSON.parse(n.data.attributesJson || '{}');
      } catch {
        errors.push({ code: 'actionInvalidAttributes', params: { label: n.data.label } });
      }
      states.push({
        id: n.id,
        type: 'action.ci.create',
        url: n.data.url || '',
        className: n.data.className || '',
        name: n.data.ciName || '',
        displayName: n.data.displayName || undefined,
        attributes,
        transitions,
      });
    }
  }

  if (errors.length > 0 || !startAt) return { config: null, errors };
  return {
    config: { kind: 'state_machine', schemaVersion: AUTOMATION_SCHEMA_VERSION, startAt, states },
    errors: [],
  };
}

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
