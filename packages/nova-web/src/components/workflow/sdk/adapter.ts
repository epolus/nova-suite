/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Edge, Node } from '@xyflow/react';
import type { NodeType, WorkflowBuilderEdge, WorkflowBuilderNode } from '@workflowbuilder/sdk';
import { isUnifiedBuilderNodeType, UNIFIED_BUILDER_NODE_LABELS } from '@nova-suite/shared';
import type { UnifiedBuilderNodeType } from '@nova-suite/shared';
import {
  parseBuilderFromConfig,
  serializeBuilderToConfig,
  type BuilderError,
  type UnifiedBuilderNodeData,
} from '../unifiedAutomationDesigner.internals';
import { autoLayoutBuilderGraph } from '../unifiedAutomationDesigner.layout';
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

function nodeDescription(nodeType: UnifiedBuilderNodeType): string {
  switch (nodeType) {
    case 'start':
      return 'Workflow entry point';
    case 'activity':
      return 'HTTP activity step';
    case 'decision':
      return 'Branch on a template condition';
    case 'delay':
      return 'Wait before continuing';
    case 'end':
      return 'Terminal success or failure';
    case 'action.rest':
      return 'REST HTTP action';
    case 'action.ci.lookup':
      return 'Look up a configuration item';
    case 'action.ci.create':
      return 'Create a configuration item';
    case 'decision.advanced':
      return 'Branch on an advanced expression';
    case 'action.notification':
      return 'Send an in-app or email notification';
    case 'action.ticket':
      return 'Create or update an incident or request';
    case 'action.assign':
      return 'Assign the current catalog task to a user or group';
    case 'action.script':
      return 'Run a short JavaScript step';
    case 'call.workflow':
      return 'Run a published workflow definition';
    default:
      return UNIFIED_BUILDER_NODE_LABELS[nodeType] ?? nodeType;
  }
}

export function toSdkNodes(nodes: Node<UnifiedBuilderNodeData>[]): WorkflowBuilderNode[] {
  return nodes.map((node) => {
    const nodeType = asNodeType(node.data.nodeType);
    const props: Record<string, unknown> = {
      label: node.data.label || UNIFIED_BUILDER_NODE_LABELS[nodeType] || node.id,
      description: nodeDescription(nodeType),
    };
    // Only include defined values — @cfworker/json-schema throws on
    // `typeof value === 'undefined'` when the key exists on the instance.
    const optional: Array<[string, unknown]> = [
      ['method', node.data.method],
      ['url', node.data.url],
      ['condition', node.data.condition],
      ['delaySeconds', node.data.delaySeconds],
      ['retryAttempts', node.data.retryAttempts],
      ['retryBackoffSec', node.data.retryBackoffSec],
      ['onError', node.data.onError],
      ['fallbackNodeId', node.data.fallbackNodeId],
      ['endResult', node.data.endResult],
      ['className', node.data.className],
      ['ciName', node.data.ciName],
      ['displayName', node.data.displayName],
      ['attributesJson', node.data.attributesJson],
      ['expressionJson', node.data.expressionJson],
      ['channel', node.data.channel],
      ['recipientType', node.data.recipientType],
      ['titleTemplate', node.data.titleTemplate],
      ['bodyTemplate', node.data.bodyTemplate],
      ['entity', node.data.entity],
      ['operation', node.data.operation],
      ['fieldsJson', node.data.fieldsJson],
      ['target', node.data.target],
      ['assigneeTemplate', node.data.assigneeTemplate],
      ['groupIdTemplate', node.data.groupIdTemplate],
      ['runtime', node.data.runtime],
      ['code', node.data.code],
      ['workflowType', node.data.workflowType],
      ['definitionId', node.data.definitionId],
      ['inputJson', node.data.inputJson],
    ];
    for (const [key, value] of optional) {
      if (value !== undefined) props[key] = value;
    }
    return {
      id: node.id,
      position: node.position,
      type: sdkCanvasType(nodeType),
      data: {
        type: nodeType,
        icon: NODE_TYPE_ICONS[nodeType],
        templateType: sdkCanvasType(nodeType),
        properties: props,
      },
    };
  });
}

export function toSdkEdges(edges: Edge[]): WorkflowBuilderEdge[] {
  return edges.map((edge) => {
    const label = typeof edge.label === 'string' ? edge.label : undefined;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'labelEdge',
      ...(label !== undefined ? { data: { label } } : { data: {} }),
    };
  });
}

export function fromSdkNodes(nodes: WorkflowBuilderNode[]): Node<UnifiedBuilderNodeData>[] {
  return nodes.map((node) => {
    const props = (node.data?.properties ?? {}) as Record<string, unknown>;
    const nodeType = asNodeType(typeof node.data?.type === 'string' ? node.data.type : undefined);
    return {
      id: node.id,
      position: node.position,
      type: 'default',
      data: {
        label: typeof props.label === 'string' ? props.label : node.id,
        nodeType,
        method: typeof props.method === 'string' ? props.method : undefined,
        url: typeof props.url === 'string' ? props.url : undefined,
        condition: typeof props.condition === 'string' ? props.condition : undefined,
        delaySeconds: typeof props.delaySeconds === 'number' ? props.delaySeconds : undefined,
        retryAttempts: typeof props.retryAttempts === 'number' ? props.retryAttempts : undefined,
        retryBackoffSec: typeof props.retryBackoffSec === 'number' ? props.retryBackoffSec : undefined,
        onError:
          props.onError === 'continue' || props.onError === 'fallback' || props.onError === 'fail'
            ? props.onError
            : undefined,
        fallbackNodeId: typeof props.fallbackNodeId === 'string' ? props.fallbackNodeId : undefined,
        endResult: props.endResult === 'failure' || props.endResult === 'success' ? props.endResult : undefined,
        className: typeof props.className === 'string' ? props.className : undefined,
        ciName: typeof props.ciName === 'string' ? props.ciName : undefined,
        displayName: typeof props.displayName === 'string' ? props.displayName : undefined,
        attributesJson: typeof props.attributesJson === 'string' ? props.attributesJson : undefined,
        expressionJson: typeof props.expressionJson === 'string' ? props.expressionJson : undefined,
        channel: typeof props.channel === 'string' ? props.channel : undefined,
        recipientType: typeof props.recipientType === 'string' ? props.recipientType : undefined,
        titleTemplate: typeof props.titleTemplate === 'string' ? props.titleTemplate : undefined,
        bodyTemplate: typeof props.bodyTemplate === 'string' ? props.bodyTemplate : undefined,
        entity: typeof props.entity === 'string' ? props.entity : undefined,
        operation: typeof props.operation === 'string' ? props.operation : undefined,
        fieldsJson: typeof props.fieldsJson === 'string' ? props.fieldsJson : undefined,
        target: typeof props.target === 'string' ? props.target : undefined,
        assigneeTemplate: typeof props.assigneeTemplate === 'string' ? props.assigneeTemplate : undefined,
        groupIdTemplate: typeof props.groupIdTemplate === 'string' ? props.groupIdTemplate : undefined,
        runtime: typeof props.runtime === 'string' ? props.runtime : undefined,
        code: typeof props.code === 'string' ? props.code : undefined,
        workflowType: typeof props.workflowType === 'string' ? props.workflowType : undefined,
        definitionId: typeof props.definitionId === 'string' ? props.definitionId : undefined,
        inputJson: typeof props.inputJson === 'string' ? props.inputJson : undefined,
      },
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
  return {
    nodes: toSdkNodes(laidOut),
    edges: toSdkEdges(parsed.edges),
  };
}

export function serializeSdkGraphToConfig(
  nodes: WorkflowBuilderNode[],
  edges: WorkflowBuilderEdge[],
): { config: Record<string, unknown> | null; errors: BuilderError[] } {
  return serializeBuilderToConfig(fromSdkNodes(nodes), fromSdkEdges(edges));
}
