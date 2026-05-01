/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Connection,
  Controls,
  Edge,
  EdgeChange,
  MarkerType,
  MiniMap,
  Node,
  NodeChange,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import {
  AUTOMATION_SCHEMA_VERSION,
  AUTOMATION_STATE_TYPES,
  isUnifiedBuilderNodeType,
  UNIFIED_BUILDER_DEFAULT_AUTOMATION_CONFIG,
  UNIFIED_BUILDER_EMPTY_ATTRIBUTES_JSON,
  UNIFIED_BUILDER_NODE_LABELS,
  UNIFIED_BUILDER_NODE_DEFAULTS,
  UNIFIED_BUILDER_PARSE_FALLBACK_EXPRESSION,
} from '@nova-suite/shared';
import type { AutomationStateType, UnifiedBuilderNodeType } from '@nova-suite/shared';
import '@xyflow/react/dist/style.css';

type UnifiedBuilderNodeData = {
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

const UNIFIED_PALETTE: Array<{ type: UnifiedBuilderNodeType; label: string }> = [
  { type: 'start', label: UNIFIED_BUILDER_NODE_LABELS.start },
  { type: 'activity', label: UNIFIED_BUILDER_NODE_LABELS.activity },
  { type: 'decision', label: UNIFIED_BUILDER_NODE_LABELS.decision },
  { type: 'delay', label: UNIFIED_BUILDER_NODE_LABELS.delay },
  { type: 'end', label: UNIFIED_BUILDER_NODE_LABELS.end },
  { type: 'action.rest', label: UNIFIED_BUILDER_NODE_LABELS['action.rest'] },
  { type: 'action.ci.lookup', label: UNIFIED_BUILDER_NODE_LABELS['action.ci.lookup'] },
  { type: 'action.ci.create', label: UNIFIED_BUILDER_NODE_LABELS['action.ci.create'] },
  { type: 'decision.advanced', label: UNIFIED_BUILDER_NODE_LABELS['decision.advanced'] },
];

function resolveBuilderNodeType(node: Node<UnifiedBuilderNodeData>): UnifiedBuilderNodeType {
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

function nextBuilderId(prefix: UnifiedBuilderNodeType): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9]+/g, '_');
  return `${safePrefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseBuilderFromConfig(raw: Record<string, unknown>): {
  nodes: Node<UnifiedBuilderNodeData>[];
  edges: Edge[];
  error?: string;
} {
  if (Object.keys(raw).length === 0) {
    return parseBuilderFromConfig(UNIFIED_BUILDER_DEFAULT_AUTOMATION_CONFIG);
  }
  if (raw.kind !== 'state_machine') return { nodes: [], edges: [], error: 'kind must be "state_machine".' };
  if (raw.schemaVersion !== AUTOMATION_SCHEMA_VERSION) {
    return { nodes: [], edges: [], error: `schemaVersion must be ${AUTOMATION_SCHEMA_VERSION}.` };
  }
  const startAt = typeof raw.startAt === 'string' ? raw.startAt : '';
  const states = Array.isArray(raw.states) ? raw.states as Array<Record<string, unknown>> : [];
  if (!startAt || states.length === 0) return { nodes: [], edges: [], error: 'startAt/states are required.' };

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
  if (!byId.has(startAt)) return { nodes: [], edges: [], error: 'startAt points to a missing state.' };
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

function serializeBuilderToConfig(
  nodes: Node<UnifiedBuilderNodeData>[],
  edges: Edge[],
): { config: Record<string, unknown> | null; errors: string[] } {
  const errors: string[] = [];
  const startNodes = nodes.filter((n) => resolveBuilderNodeType(n) === 'start');
  if (startNodes.length !== 1) errors.push('Exactly one Start node is required.');
  const startNode = startNodes[0];
  const fromStart = startNode ? edges.filter((e) => e.source === startNode.id) : [];
  if (!startNode || fromStart.length !== 1 || !fromStart[0]?.target) {
    errors.push('Start node must have exactly one outgoing transition.');
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
      errors.push(`Node "${n.data.label}" has no outgoing transition.`);
    }
    if (t === 'decision' || t === 'decision.advanced') {
      const labels = new Set(transitions.map((tr) => String((tr as { when?: string }).when || '')));
      if (!labels.has('true') || !labels.has('false')) {
        errors.push(`Decision "${n.data.label}" needs true/false labeled transitions.`);
      }
    }
    for (const tr of transitions) {
      if (!byId.has(tr.to)) errors.push(`Transition from "${n.id}" points to missing "${tr.to}"`);
    }

    if (t === 'activity' || t === 'action.rest') {
      if (!n.data.url || !n.data.url.trim()) errors.push(`Activity "${n.data.label}" requires url.`);
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
        errors.push(`Decision "${n.data.label}" has invalid expression JSON.`);
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
        errors.push(`Action "${n.data.label}" has invalid attributes JSON.`);
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
        errors.push(`Action "${n.data.label}" has invalid attributes JSON.`);
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

export const __test__ = {
  parseBuilderFromConfig,
  serializeBuilderToConfig,
  resolveBuilderNodeType,
};

function autoLayoutBuilderGraph(
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

function UnifiedAutomationDesignerInner({
  initialConfigJson,
  onApply,
}: {
  initialConfigJson: string;
  onApply: (cfg: Record<string, unknown>) => void;
}) {
  const lastEmittedJsonRef = useRef('');
  const parsed = useMemo(() => {
    try {
      const raw = JSON.parse(initialConfigJson || '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { nodes: [], edges: [], error: 'Automation JSON must be an object.' };
      }
      return parseBuilderFromConfig(raw as Record<string, unknown>);
    } catch {
      return { nodes: [], edges: [], error: 'Automation JSON is invalid.' };
    }
  }, [initialConfigJson]);
  const [nodes, setNodes] = useState<Node<UnifiedBuilderNodeData>[]>(parsed.nodes);
  const [edges, setEdges] = useState<Edge[]>(parsed.edges);
  const [builderError, setBuilderError] = useState<string>(parsed.error || '');
  const selectedNode = nodes.find((n) => n.selected);
  const selectedEdge = edges.find((e) => e.selected);

  useEffect(() => {
    if (initialConfigJson && initialConfigJson === lastEmittedJsonRef.current) return;
    if (parsed.error) {
      setBuilderError(parsed.error);
      return;
    }
    setBuilderError('');
    setNodes(autoLayoutBuilderGraph(parsed.nodes, parsed.edges));
    setEdges(parsed.edges);
  }, [initialConfigJson, parsed]);

  const onNodesChange = useMemo(
    () => (changes: NodeChange<Node<UnifiedBuilderNodeData>>[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useMemo(
    () => (changes: EdgeChange<Edge>[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useMemo(
    () => (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const sourceType = sourceNode ? resolveBuilderNodeType(sourceNode) : null;
      let label: string | undefined;
      if (sourceType === 'decision' || sourceType === 'decision.advanced') {
        const used = new Set(edges.filter((e) => e.source === connection.source).map((e) => String(e.label || '')));
        label = used.has('true') ? 'false' : 'true';
      }
      setEdges((eds) => addEdge({ ...connection, label, markerEnd: { type: MarkerType.ArrowClosed } }, eds));
    },
    [edges, nodes],
  );

  const updateSelected = (patch: Partial<UnifiedBuilderNodeData>) => {
    if (!selectedNode) return;
    setNodes((nds) => nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, ...patch } } : n)));
  };
  const updateSelectedEdgeLabel = (label: string) => {
    if (!selectedEdge) return;
    setEdges((eds) => eds.map((e) => (e.id === selectedEdge.id ? { ...e, label: label.trim() ? label : undefined } : e)));
  };

  const addNode = (type: UnifiedBuilderNodeType) => {
    const id = type === 'start' ? `start-${Date.now()}` : nextBuilderId(type);
    if (type === 'start' && nodes.some((n) => resolveBuilderNodeType(n) === 'start')) {
      setBuilderError('Only one Start node is allowed.');
      return;
    }
    setBuilderError('');
    setNodes((nds) => {
      const selectedAnchor = selectedNode ? nds.find((n) => n.id === selectedNode.id) : undefined;
      const nonStart = nds.filter((n) => resolveBuilderNodeType(n) !== 'start');
      const anchor = selectedAnchor
        ? { x: selectedAnchor.position.x, y: selectedAnchor.position.y }
        : nonStart.length > 0
          ? { x: Math.max(...nonStart.map((n) => n.position.x)), y: nonStart.reduce((sum, n) => sum + n.position.y, 0) / nonStart.length }
          : { x: 180, y: 160 };
      return nds.concat({
        id,
        type: 'default',
        position: { x: anchor.x + 240, y: anchor.y },
        data: {
          method: 'GET',
          url: '',
          condition: '{{response.status}}',
          delaySeconds: 5,
          retryAttempts: 1,
          retryBackoffSec: 0,
          onError: 'fail',
          endResult: 'success',
          attributesJson: UNIFIED_BUILDER_EMPTY_ATTRIBUTES_JSON,
          expressionJson: JSON.stringify(UNIFIED_BUILDER_PARSE_FALLBACK_EXPRESSION, null, 2),
          ...UNIFIED_BUILDER_NODE_DEFAULTS[type],
          label: UNIFIED_BUILDER_NODE_DEFAULTS[type].label || (type === 'start' ? 'Start' : id),
          nodeType: type,
        },
      });
    });
  };

  const removeSelectedNode = useCallback(() => {
    if (!selectedNode) return;
    if (resolveBuilderNodeType(selectedNode) === 'start') {
      setBuilderError('Start node cannot be deleted.');
      return;
    }
    setBuilderError('');
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
  }, [selectedNode]);

  const removeSelectedEdge = useCallback(() => {
    if (!selectedEdge) return;
    setBuilderError('');
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id));
  }, [selectedEdge]);

  const autoLayout = useCallback(() => {
    setNodes((nds) => autoLayoutBuilderGraph(nds, edges));
  }, [edges]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const out = serializeBuilderToConfig(nodes, edges);
      if (!out.config) {
        setBuilderError(out.errors.join(' '));
        return;
      }
      setBuilderError('');
      const json = JSON.stringify(out.config, null, 2);
      lastEmittedJsonRef.current = json;
      onApply(out.config);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [nodes, edges, onApply]);

  useEffect(() => {
    const onKeyDown = (evt: KeyboardEvent) => {
      const target = evt.target as HTMLElement | null;
      const isEditingText = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isEditingText) return;
      if (evt.key === 'Delete' || evt.key === 'Backspace') {
        if (selectedEdge) {
          evt.preventDefault();
          removeSelectedEdge();
          return;
        }
        if (selectedNode) {
          evt.preventDefault();
          removeSelectedNode();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [removeSelectedEdge, removeSelectedNode, selectedEdge, selectedNode]);

  return (
    <div className="catalog-automation-builder border border-gray-200 rounded-lg p-3 bg-white">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {UNIFIED_PALETTE.map((p) => (
          <button key={p.type} type="button" onClick={() => addNode(p.type)} className="px-2 py-1 text-xs rounded-md border border-gray-200 bg-white hover:bg-gray-50">
            + {p.label}
          </button>
        ))}
        <button type="button" onClick={autoLayout} className="ml-auto px-2 py-1 text-xs rounded-md border border-gray-200 bg-white hover:bg-gray-50">
          Auto-format
        </button>
        <button type="button" onClick={removeSelectedNode} disabled={!selectedNode} className="px-2 py-1 text-xs rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50">
          Remove node
        </button>
        <button type="button" onClick={removeSelectedEdge} disabled={!selectedEdge} className="px-2 py-1 text-xs rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50">
          Remove edge
        </button>
        <span className="text-[11px] text-gray-500">JSON sync: automatic</span>
      </div>
      {builderError && <div className="mb-2 p-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">{builderError}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3">
        <div className="h-[420px] border border-gray-200 rounded-md">
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} fitView>
            <Background />
            <MiniMap />
            <Controls />
          </ReactFlow>
        </div>
        <div className="border border-gray-200 rounded-md p-2 text-xs">
          {!selectedNode && !selectedEdge && <p className="text-gray-500">Select a node or edge to edit.</p>}
          {selectedEdge && (
            <div className="space-y-2">
              <div>
                <label className="block text-gray-500 mb-1">Edge label / condition</label>
                <input
                  value={typeof selectedEdge.label === 'string' ? selectedEdge.label : ''}
                  onChange={(e) => updateSelectedEdgeLabel(e.target.value)}
                  placeholder="e.g. true, false, success, failure"
                  className="w-full border border-gray-200 rounded px-2 py-1 font-mono"
                />
              </div>
            </div>
          )}
          {selectedNode && (
            <div className="space-y-2">
              <div>
                <label className="block text-gray-500 mb-1">Label</label>
                <input value={selectedNode.data.label || ''} onChange={(e) => updateSelected({ label: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1" />
              </div>
              {(resolveBuilderNodeType(selectedNode) === 'activity' || resolveBuilderNodeType(selectedNode) === 'action.rest') && (
                <>
                  <div>
                    <label className="block text-gray-500 mb-1">Method</label>
                    <input value={selectedNode.data.method || 'GET'} onChange={(e) => updateSelected({ method: e.target.value.toUpperCase() })} className="w-full border border-gray-200 rounded px-2 py-1 font-mono" />
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-1">URL</label>
                    <input value={selectedNode.data.url || ''} onChange={(e) => updateSelected({ url: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1 font-mono" />
                  </div>
                </>
              )}
              {resolveBuilderNodeType(selectedNode) === 'decision' && (
                <div>
                  <label className="block text-gray-500 mb-1">Condition</label>
                  <input value={selectedNode.data.condition || ''} onChange={(e) => updateSelected({ condition: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1 font-mono" />
                </div>
              )}
              {resolveBuilderNodeType(selectedNode) === 'decision.advanced' && (
                <div>
                  <label className="block text-gray-500 mb-1">Expression JSON</label>
                  <textarea rows={6} value={selectedNode.data.expressionJson || '{\n  "op": "eq",\n  "left": { "var": "response.status" },\n  "right": 200\n}'} onChange={(e) => updateSelected({ expressionJson: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1 font-mono" />
                </div>
              )}
              {resolveBuilderNodeType(selectedNode) === 'delay' && (
                <div>
                  <label className="block text-gray-500 mb-1">Delay Seconds</label>
                  <input type="number" min={1} value={selectedNode.data.delaySeconds || 5} onChange={(e) => updateSelected({ delaySeconds: parseInt(e.target.value, 10) || 1 })} className="w-full border border-gray-200 rounded px-2 py-1" />
                </div>
              )}
              {(resolveBuilderNodeType(selectedNode) === 'action.ci.lookup' || resolveBuilderNodeType(selectedNode) === 'action.ci.create') && (
                <>
                  <div>
                    <label className="block text-gray-500 mb-1">URL</label>
                    <input value={selectedNode.data.url || ''} onChange={(e) => updateSelected({ url: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1 font-mono" />
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-1">Class Name</label>
                    <input value={selectedNode.data.className || ''} onChange={(e) => updateSelected({ className: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1" />
                  </div>
                </>
              )}
              {resolveBuilderNodeType(selectedNode) === 'action.ci.create' && (
                <>
                  <div>
                    <label className="block text-gray-500 mb-1">CI Name Template</label>
                    <input value={selectedNode.data.ciName || ''} onChange={(e) => updateSelected({ ciName: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1 font-mono" />
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-1">Display Name Template</label>
                    <input value={selectedNode.data.displayName || ''} onChange={(e) => updateSelected({ displayName: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1 font-mono" />
                  </div>
                </>
              )}
              {(resolveBuilderNodeType(selectedNode) === 'action.ci.lookup' || resolveBuilderNodeType(selectedNode) === 'action.ci.create') && (
                <div>
                  <label className="block text-gray-500 mb-1">Attributes JSON</label>
                  <textarea rows={5} value={selectedNode.data.attributesJson || '{\n  \n}'} onChange={(e) => updateSelected({ attributesJson: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1 font-mono" />
                </div>
              )}
              {resolveBuilderNodeType(selectedNode) === 'end' && (
                <div>
                  <label className="block text-gray-500 mb-1">Result</label>
                  <select value={selectedNode.data.endResult || 'success'} onChange={(e) => updateSelected({ endResult: e.target.value as 'success' | 'failure' })} className="w-full border border-gray-200 rounded px-2 py-1">
                    <option value="success">success</option>
                    <option value="failure">failure</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UnifiedAutomationDesigner(props: {
  initialConfigJson: string;
  onApply: (cfg: Record<string, unknown>) => void;
}) {
  return (
    <ReactFlowProvider>
      <UnifiedAutomationDesignerInner {...props} />
    </ReactFlowProvider>
  );
}
