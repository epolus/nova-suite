/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Edge, Node } from '@xyflow/react';
import { getHandleId, type NodeType, type WorkflowBuilderEdge, type WorkflowBuilderNode } from '@workflowbuilder/sdk';
import { isUnifiedBuilderNodeType, UNIFIED_BUILDER_NODE_LABELS } from '@nova-suite/shared';
import type { UnifiedBuilderNodeType } from '@nova-suite/shared';
import {
  parseBuilderFromConfig,
  serializeBuilderToConfig,
  type BuilderError,
  type UnifiedBuilderNodeData,
} from '../unifiedAutomationDesigner.internals';
import { autoLayoutBuilderGraph } from '../unifiedAutomationDesigner.layout';
import { NODE_DESCRIPTIONS } from './defineNode';
import { NODE_TYPE_ICONS } from './icons';

/** Matches `@workflowbuilder/sdk` `NodeType` enum values (avoid importing SDK runtime here). */
const SDK_CANVAS_TYPE = {
  Node: 'node' as NodeType,
  StartNode: 'start-node' as NodeType,
  DecisionNode: 'decision-node' as NodeType,
};

function asNodeType(raw: string | undefined): UnifiedBuilderNodeType {
  if (raw && isUnifiedBuilderNodeType(raw)) return raw;
  return 'activity';
}

/** xyflow `type` must match the SDK template registry (not React Flow's `default`). */
function sdkCanvasType(nodeType: UnifiedBuilderNodeType): NodeType {
  if (nodeType === 'start') return SDK_CANVAS_TYPE.StartNode;
  if (nodeType === 'decision' || nodeType === 'decision.advanced') {
    return SDK_CANVAS_TYPE.DecisionNode;
  }
  return SDK_CANVAS_TYPE.Node;
}

/** Canvas fields copied both ways. `onError` and `endResult` stay unions so invalid strings are dropped. */
const CANVAS_FIELDS = [
  ['method', 'string'],
  ['url', 'string'],
  ['condition', 'string'],
  ['delaySeconds', 'number'],
  ['retryAttempts', 'number'],
  ['retryBackoffSec', 'number'],
  ['onError', 'onError'],
  ['fallbackNodeId', 'string'],
  ['endResult', 'endResult'],
  ['className', 'string'],
  ['ciName', 'string'],
  ['displayName', 'string'],
  ['attributesJson', 'string'],
  ['expressionJson', 'string'],
  ['channel', 'string'],
  ['recipientType', 'string'],
  ['titleTemplate', 'string'],
  ['bodyTemplate', 'string'],
  ['entity', 'string'],
  ['operation', 'string'],
  ['fieldsJson', 'string'],
  ['target', 'string'],
  ['assigneeTemplate', 'string'],
  ['groupIdTemplate', 'string'],
  ['runtime', 'string'],
  ['code', 'string'],
  ['workflowType', 'string'],
  ['definitionId', 'string'],
  ['inputJson', 'string'],
  ['itemsExpr', 'string'],
  ['maxIterations', 'number'],
  ['joinId', 'string'],
  ['approverType', 'string'],
  ['approverTemplate', 'string'],
  ['approvalName', 'string'],
  ['taskName', 'string'],
  ['groupTemplate', 'string'],
  ['waitForCompletion', 'boolean'],
  ['instructions', 'string'],
  ['assignmentsJson', 'string'],
  ['extraJson', 'string'],
] as const;

function canvasValue(raw: unknown, kind: (typeof CANVAS_FIELDS)[number][1]): unknown {
  if (kind === 'string') return typeof raw === 'string' ? raw : undefined;
  if (kind === 'number') return typeof raw === 'number' ? raw : undefined;
  if (kind === 'boolean') return typeof raw === 'boolean' ? raw : undefined;
  if (kind === 'onError') {
    return raw === 'continue' || raw === 'fallback' || raw === 'fail' ? raw : undefined;
  }
  return raw === 'failure' || raw === 'success' ? raw : undefined;
}

function copyCanvasFields(source: Record<string, unknown>, target: Record<string, unknown>): void {
  for (const [key, kind] of CANVAS_FIELDS) {
    const value = canvasValue(source[key], kind);
    if (value !== undefined) target[key] = value;
  }
}

export function toSdkNodes(nodes: Node<UnifiedBuilderNodeData>[]): WorkflowBuilderNode[] {
  return nodes.map((node) => {
    const nodeType = asNodeType(node.data.nodeType);
    const props: Record<string, unknown> = {
      label: node.data.label || UNIFIED_BUILDER_NODE_LABELS[nodeType] || node.id,
      description: NODE_DESCRIPTIONS[nodeType],
    };
    // Only include defined values — @cfworker/json-schema throws on
    // `typeof value === 'undefined'` when the key exists on the instance.
    copyCanvasFields(node.data as Record<string, unknown>, props);
    return {
      id: node.id,
      position: node.position,
      type: sdkCanvasType(nodeType),
      data: {
        type: nodeType,
        icon: NODE_TYPE_ICONS[nodeType],
        templateType: sdkCanvasType(nodeType),
        ...(nodeType === 'start' ? { isStartNode: true } : {}),
        properties: props,
      },
    };
  });
}

/** Decision-node templates only render edges that hang off an inner branch handle. */
function isDecisionCanvasType(nodeType: string | undefined): boolean {
  return nodeType === 'decision' || nodeType === 'decision.advanced';
}

function decisionBranchInnerId(edge: Edge): string {
  const existing = typeof edge.sourceHandle === 'string' ? edge.sourceHandle : '';
  const match = /^source:inner:(.+)$/.exec(existing);
  if (match?.[1]) return match[1];
  // Keep ids stable across reloads so branch order does not reshuffle.
  const label = typeof edge.label === 'string' && edge.label ? edge.label : 'branch';
  return `${edge.source}__${label}`;
}

export function toSdkEdges(
  edges: Edge[],
  nodes: Array<Node<UnifiedBuilderNodeData> | WorkflowBuilderNode> = [],
): WorkflowBuilderEdge[] {
  const decisionIds = new Set(
    nodes
      .filter((n) => {
        const raw = 'data' in n && n.data && typeof n.data === 'object'
          ? ('nodeType' in n.data
            ? (n.data as { nodeType?: string }).nodeType
            : (n.data as { type?: string }).type)
          : undefined;
        return isDecisionCanvasType(typeof raw === 'string' ? raw : undefined);
      })
      .map((n) => n.id),
  );
  return edges.map((edge) => {
    const label = typeof edge.label === 'string' ? edge.label : undefined;
    const data = label !== undefined ? { label } : {};
    if (!decisionIds.has(edge.source)) {
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'labelEdge',
        data,
      };
    }
    const innerId = decisionBranchInnerId(edge);
    return {
      // SDK decision templates key branches by edge id === inner handle id.
      id: innerId,
      source: edge.source,
      target: edge.target,
      type: 'labelEdge',
      sourceHandle: getHandleId({ handleType: 'source', innerId }),
      data,
    };
  });
}

export function fromSdkNodes(nodes: WorkflowBuilderNode[]): Node<UnifiedBuilderNodeData>[] {
  return nodes.map((node) => {
    const props = (node.data?.properties ?? {}) as Record<string, unknown>;
    const nodeType = asNodeType(typeof node.data?.type === 'string' ? node.data.type : undefined);
    const data: UnifiedBuilderNodeData = {
      label: typeof props.label === 'string' ? props.label : node.id,
      nodeType,
    };
    copyCanvasFields(props, data as Record<string, unknown>);
    return {
      id: node.id,
      position: node.position,
      type: 'default',
      data,
    };
  });
}

export function fromSdkEdges(edges: WorkflowBuilderEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.data?.label,
  }));
}

/**
 * Decision-node templates only draw branch handles listed in
 * `properties.decisionBranches`. Edges that reference those handles must use
 * the same `sourceHandle`, or React Flow drops them.
 */
function attachDecisionBranches(
  nodes: WorkflowBuilderNode[],
  edges: WorkflowBuilderEdge[],
): WorkflowBuilderNode[] {
  return nodes.map((node) => {
    if (node.type !== SDK_CANVAS_TYPE.DecisionNode) return node;
    const outs = edges.filter((e) => e.source === node.id && typeof e.sourceHandle === 'string');
    if (outs.length === 0) return node;
    const decisionBranches = outs.map((edge, index) => ({
      id: edge.id,
      sourceHandle: edge.sourceHandle as string,
      label: typeof edge.data?.label === 'string' && edge.data.label
        ? edge.data.label
        : `Branch #${index + 1}`,
      conditions: [] as unknown[],
    }));
    return {
      ...node,
      data: {
        ...node.data,
        properties: {
          ...node.data.properties,
          decisionBranches,
        },
      },
    };
  });
}

export function loadSdkGraphFromConfig(raw: Record<string, unknown>): {
  nodes: WorkflowBuilderNode[];
  edges: WorkflowBuilderEdge[];
  error?: BuilderError;
} {
  const parsed = parseBuilderFromConfig(raw);
  if (parsed.error) {
    return { nodes: [], edges: [], error: parsed.error };
  }
  const laidOut = autoLayoutBuilderGraph(parsed.nodes, parsed.edges);
  const edges = toSdkEdges(parsed.edges, laidOut);
  return {
    nodes: attachDecisionBranches(toSdkNodes(laidOut), edges),
    edges,
  };
}

export function serializeSdkGraphToConfig(
  nodes: WorkflowBuilderNode[],
  edges: WorkflowBuilderEdge[],
): { config: Record<string, unknown> | null; errors: BuilderError[] } {
  return serializeBuilderToConfig(fromSdkNodes(nodes), fromSdkEdges(edges));
}
