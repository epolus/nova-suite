/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import '@xyflow/react/dist/style.css';
import type { CatalogTasksListLocationState } from './CatalogTasksPage';
import { admin as adminApi, catalog, credentials as credentialsApi } from '../../api/client';
import type { AllCatalogTask, AssignmentGroupItem, CatalogTask, ServiceItem, TenantCredentialListItem } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import ServiceItemCombobox from '../../components/ServiceItemCombobox';

const TASK_TYPES = [
  { value: 'approval', label: 'Approval' },
  { value: 'manual', label: 'Manual' },
  { value: 'automated', label: 'Automated' },
] as const;

function catalogTasksReturnState(serviceItemId: string | undefined): CatalogTasksListLocationState | undefined {
  if (!serviceItemId) return undefined;
  return { catalogTasksTab: 'by-item', focusServiceItemId: serviceItemId };
}

/** Full automation_config examples (replace editor). */
const AUTOMATION_SNIPPETS: { id: string; label: string; json: string }[] = [
  {
    id: 'state_basic',
    label: 'State machine: single HTTP step',
    json: JSON.stringify(
      {
        kind: 'state_machine',
        startAt: 'check',
        states: [
          {
            id: 'check',
            type: 'activity',
            method: 'GET',
            url: 'https://httpbin.org/status/200',
            retryAttempts: 2,
            retryBackoffSec: 2,
            transitions: [{ to: 'done', when: 'success' }, { to: 'failed', when: 'failure' }],
            onSuccess: { mergeFormData: { rest_ok: 'true' } },
          },
          { id: 'done', type: 'end', result: 'success' },
          { id: 'failed', type: 'end', result: 'failure', onFailure: { skipTaskOrders: [], rejectRequest: false } },
        ],
      },
      null,
      2,
    ),
  },
  {
    id: 'state_decision',
    label: 'State machine: decision + delay',
    json: JSON.stringify(
      {
        kind: 'state_machine',
        startAt: 'probe',
        states: [
          {
            id: 'probe',
            type: 'activity',
            method: 'GET',
            url: 'https://httpbin.org/json',
            transitions: [{ to: 'branch' }],
          },
          {
            id: 'branch',
            type: 'decision',
            condition: '{{response.status}}',
            transitions: [{ to: 'pause', when: 'true' }, { to: 'rejected', when: 'false' }],
          },
          { id: 'pause', type: 'delay', delaySeconds: 5, transitions: [{ to: 'approved' }] },
          { id: 'approved', type: 'end', result: 'success' },
          { id: 'rejected', type: 'end', result: 'failure', onFailure: { rejectRequest: true } },
        ],
      },
      null,
      2,
    ),
  },
];

function isEmptyAutomationJson(s: string): boolean {
  try {
    const o = JSON.parse(s || '{}') as unknown;
    return typeof o === 'object' && o !== null && !Array.isArray(o) && Object.keys(o as object).length === 0;
  } catch {
    return false;
  }
}

function validateAutomationConfigClient(raw: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (raw.kind !== 'state_machine') errors.push('kind must be "state_machine"');
  if (typeof raw.startAt !== 'string' || !raw.startAt.trim()) errors.push('startAt is required');
  const states = Array.isArray(raw.states) ? raw.states as Array<Record<string, unknown>> : [];
  if (!Array.isArray(raw.states) || states.length === 0) errors.push('states must be a non-empty array');
  const ids = new Set<string>();
  for (const s of states) {
    const id = typeof s.id === 'string' ? s.id : '';
    const type = typeof s.type === 'string' ? s.type : '';
    if (!id) { errors.push('each state requires id'); continue; }
    if (ids.has(id)) errors.push(`duplicate state id: ${id}`);
    ids.add(id);
    if (!['activity', 'decision', 'delay', 'end'].includes(type)) errors.push(`invalid type on state ${id}`);
  }
  return errors;
}

const TEMPLATE_TOKENS: { label: string; token: string }[] = [
  { label: 'request.number', token: '{{request.number}}' },
  { label: 'request.id', token: '{{request.id}}' },
  { label: 'request.form_data…', token: '{{request.form_data.FIELD}}' },
  { label: 'response.body…', token: '{{response.body}}' },
  { label: 'env var', token: '{{env.VAR_NAME}}' },
  { label: 'vault credential', token: '{{cred.slug}}' },
];

type BuilderNodeType = 'start' | 'activity' | 'decision' | 'delay' | 'end';
type CatalogBuilderNodeData = {
  label: string;
  nodeType?: BuilderNodeType;
  method?: string;
  url?: string;
  condition?: string;
  delaySeconds?: number;
  retryAttempts?: number;
  retryBackoffSec?: number;
  onError?: 'fail' | 'continue' | 'fallback';
  fallbackNodeId?: string;
  endResult?: 'success' | 'failure';
};

function resolveBuilderNodeType(node: Node<CatalogBuilderNodeData>): BuilderNodeType {
  if (node.data.nodeType) return node.data.nodeType;
  const prefix = node.id.split('-')[0];
  if (prefix === 'start' || prefix === 'activity' || prefix === 'decision' || prefix === 'delay' || prefix === 'end') {
    return prefix;
  }
  const label = (node.data.label || '').trim().toLowerCase();
  if (label === 'start' || label === 'activity' || label === 'decision' || label === 'delay' || label === 'end') {
    return label;
  }
  return 'activity';
}

const DEFAULT_AUTOMATION_CONFIG: Record<string, unknown> = {
  kind: 'state_machine',
  startAt: 'activity-1',
  states: [
    {
      id: 'activity-1',
      type: 'activity',
      method: 'GET',
      url: 'https://httpbin.org/status/200',
      transitions: [
        { to: 'end-success', when: 'success' },
        { to: 'end-failure', when: 'failure' },
      ],
    },
    { id: 'end-success', type: 'end', result: 'success' },
    { id: 'end-failure', type: 'end', result: 'failure' },
  ],
};

const CATALOG_PALETTE: Array<{ type: BuilderNodeType; label: string }> = [
  { type: 'start', label: 'Start' },
  { type: 'activity', label: 'Activity' },
  { type: 'decision', label: 'Decision' },
  { type: 'delay', label: 'Delay' },
  { type: 'end', label: 'End' },
];

function nextBuilderId(prefix: BuilderNodeType): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseBuilderFromConfig(raw: Record<string, unknown>): {
  nodes: Node<CatalogBuilderNodeData>[];
  edges: Edge[];
  error?: string;
} {
  if (Object.keys(raw).length === 0) {
    return parseBuilderFromConfig(DEFAULT_AUTOMATION_CONFIG);
  }
  if (raw.kind !== 'state_machine') return { nodes: [], edges: [], error: 'kind must be "state_machine".' };
  const startAt = typeof raw.startAt === 'string' ? raw.startAt : '';
  const states = Array.isArray(raw.states) ? raw.states as Array<Record<string, unknown>> : [];
  if (!startAt || states.length === 0) return { nodes: [], edges: [], error: 'startAt/states are required.' };

  const nodes: Node<CatalogBuilderNodeData>[] = [
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
    if (!id || !['activity', 'decision', 'delay', 'end'].includes(type)) continue;
    const t = type as Exclude<BuilderNodeType, 'start'>;
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
  nodes: Node<CatalogBuilderNodeData>[],
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
    if (t === 'decision') {
      const labels = new Set(transitions.map((tr) => String((tr as { when?: string }).when || '')));
      if (!labels.has('true') || !labels.has('false')) {
        errors.push(`Decision "${n.data.label}" needs true/false labeled transitions.`);
      }
    }
    for (const tr of transitions) {
      if (!byId.has(tr.to)) errors.push(`Transition from "${n.id}" points to missing "${tr.to}"`);
    }

    if (t === 'activity') {
      if (!n.data.url || !n.data.url.trim()) errors.push(`Activity "${n.data.label}" requires url.`);
      states.push({
        id: n.id,
        type: 'activity',
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
    }
  }

  if (errors.length > 0 || !startAt) return { config: null, errors };
  return {
    config: { kind: 'state_machine', startAt, states },
    errors: [],
  };
}

function autoLayoutBuilderGraph(
  nodes: Node<CatalogBuilderNodeData>[],
  edges: Edge[],
): Node<CatalogBuilderNodeData>[] {
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

function CatalogAutomationBuilder({
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
  const [nodes, setNodes] = useState<Node<CatalogBuilderNodeData>[]>(parsed.nodes);
  const [edges, setEdges] = useState<Edge[]>(parsed.edges);
  const [builderError, setBuilderError] = useState<string>(parsed.error || '');
  const selectedNode = nodes.find((n) => n.selected);
  const selectedEdge = edges.find((e) => e.selected);

  useEffect(() => {
    if (initialConfigJson && initialConfigJson === lastEmittedJsonRef.current) {
      return;
    }
    const next = parsed;
    if (next.error) {
      setBuilderError(next.error);
      return;
    }
    setBuilderError('');
    setNodes(autoLayoutBuilderGraph(next.nodes, next.edges));
    setEdges(next.edges);
  }, [initialConfigJson, parsed]);

  const onNodesChange = useMemo(
    () => (changes: NodeChange<Node<CatalogBuilderNodeData>>[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
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
      if (sourceType === 'decision') {
        const used = new Set(edges.filter((e) => e.source === connection.source).map((e) => String(e.label || '')));
        label = used.has('true') ? 'false' : 'true';
      }
      setEdges((eds) =>
        addEdge({ ...connection, label, markerEnd: { type: MarkerType.ArrowClosed } }, eds),
      );
    },
    [edges, nodes],
  );

  const updateSelected = (patch: Partial<CatalogBuilderNodeData>) => {
    if (!selectedNode) return;
    setNodes((nds) => nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, ...patch } } : n)));
  };

  const updateSelectedEdgeLabel = (label: string) => {
    if (!selectedEdge) return;
    setEdges((eds) =>
      eds.map((e) => (e.id === selectedEdge.id ? { ...e, label: label.trim() ? label : undefined } : e)),
    );
  };

  const addNode = (type: BuilderNodeType) => {
    const id = type === 'start' ? `start-${Date.now()}` : nextBuilderId(type);
    if (type === 'start' && nodes.some((n) => resolveBuilderNodeType(n) === 'start')) {
      setBuilderError('Only one Start node is allowed.');
      return;
    }
    setBuilderError('');
    setNodes((nds) => {
      const selectedAnchor = selectedNode
        ? nds.find((n) => n.id === selectedNode.id)
        : undefined;
      const nonStart = nds.filter((n) => resolveBuilderNodeType(n) !== 'start');
      const anchor = selectedAnchor
        ? { x: selectedAnchor.position.x, y: selectedAnchor.position.y }
        : nonStart.length > 0
          ? {
              x: Math.max(...nonStart.map((n) => n.position.x)),
              y: nonStart.reduce((sum, n) => sum + n.position.y, 0) / nonStart.length,
            }
          : { x: 180, y: 160 };

      return nds.concat({
        id,
        type: 'default',
        position: { x: anchor.x + 240, y: anchor.y },
        data: {
          label: type === 'start' ? 'Start' : id,
          nodeType: type,
          method: 'GET',
          url: '',
          condition: '{{response.status}}',
          delaySeconds: 5,
          retryAttempts: 1,
          retryBackoffSec: 0,
          onError: 'fail',
          endResult: 'success',
        },
      });
    });
  };

  const removeSelectedNode = useCallback(() => {
    if (!selectedNode) return;
    const t = resolveBuilderNodeType(selectedNode);
    if (t === 'start') {
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
      const isEditingText =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
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
        {CATALOG_PALETTE.map((p) => (
          <button
            key={p.type}
            type="button"
            onClick={() => addNode(p.type)}
            className="px-2 py-1 text-xs rounded-md border border-gray-200 bg-white hover:bg-gray-50"
          >
            + {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={autoLayout}
          className="ml-auto px-2 py-1 text-xs rounded-md border border-gray-200 bg-white hover:bg-gray-50"
        >
          Auto-format
        </button>
        <button
          type="button"
          onClick={removeSelectedNode}
          disabled={!selectedNode}
          className="px-2 py-1 text-xs rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          Remove node
        </button>
        <button
          type="button"
          onClick={removeSelectedEdge}
          disabled={!selectedEdge}
          className="px-2 py-1 text-xs rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          Remove edge
        </button>
        <span className="text-[11px] text-gray-500">JSON sync: automatic</span>
      </div>
      {builderError && (
        <div className="mb-2 p-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">{builderError}</div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3">
        <div className="h-[420px] border border-gray-200 rounded-md">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
          >
            <Background />
            <MiniMap />
            <Controls />
          </ReactFlow>
        </div>
        <div className="border border-gray-200 rounded-md p-2 text-xs">
          {selectedNode ? (
            <div className="space-y-2">
              <div>
                <label className="block text-gray-500 mb-1">Label</label>
                <input
                  value={selectedNode.data.label || ''}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                  className="w-full border border-gray-200 rounded px-2 py-1"
                />
              </div>
              {resolveBuilderNodeType(selectedNode) === 'activity' && (
                <>
                  <div>
                    <label className="block text-gray-500 mb-1">Method</label>
                    <input
                      value={selectedNode.data.method || 'GET'}
                      onChange={(e) => updateSelected({ method: e.target.value.toUpperCase() })}
                      className="w-full border border-gray-200 rounded px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-1">URL</label>
                    <input
                      value={selectedNode.data.url || ''}
                      onChange={(e) => updateSelected({ url: e.target.value })}
                      className="w-full border border-gray-200 rounded px-2 py-1 font-mono"
                    />
                  </div>
                </>
              )}
              {resolveBuilderNodeType(selectedNode) === 'decision' && (
                <div>
                  <label className="block text-gray-500 mb-1">Condition</label>
                  <input
                    value={selectedNode.data.condition || ''}
                    onChange={(e) => updateSelected({ condition: e.target.value })}
                    className="w-full border border-gray-200 rounded px-2 py-1 font-mono"
                  />
                </div>
              )}
              {resolveBuilderNodeType(selectedNode) === 'delay' && (
                <div>
                  <label className="block text-gray-500 mb-1">Delay Seconds</label>
                  <input
                    type="number"
                    min={1}
                    value={selectedNode.data.delaySeconds || 5}
                    onChange={(e) => updateSelected({ delaySeconds: parseInt(e.target.value, 10) || 1 })}
                    className="w-full border border-gray-200 rounded px-2 py-1"
                  />
                </div>
              )}
              {resolveBuilderNodeType(selectedNode) === 'end' && (
                <div>
                  <label className="block text-gray-500 mb-1">Result</label>
                  <select
                    value={selectedNode.data.endResult || 'success'}
                    onChange={(e) => updateSelected({ endResult: e.target.value as 'success' | 'failure' })}
                    className="w-full border border-gray-200 rounded px-2 py-1"
                  >
                    <option value="success">success</option>
                    <option value="failure">failure</option>
                  </select>
                </div>
              )}
            </div>
          ) : selectedEdge ? (
            <div className="space-y-2">
              <div>
                <label className="block text-gray-500 mb-1">Edge label / condition</label>
                <input
                  value={typeof selectedEdge.label === 'string' ? selectedEdge.label : ''}
                  onChange={(e) => updateSelectedEdgeLabel(e.target.value)}
                  placeholder='e.g. true, false, success, failure'
                  className="w-full border border-gray-200 rounded px-2 py-1 font-mono"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => updateSelectedEdgeLabel('true')}
                  className="px-2 py-1 text-[11px] rounded border border-gray-200 bg-white hover:bg-gray-50"
                >
                  true
                </button>
                <button
                  type="button"
                  onClick={() => updateSelectedEdgeLabel('false')}
                  className="px-2 py-1 text-[11px] rounded border border-gray-200 bg-white hover:bg-gray-50"
                >
                  false
                </button>
                <button
                  type="button"
                  onClick={() => updateSelectedEdgeLabel('')}
                  className="px-2 py-1 text-[11px] rounded border border-gray-200 bg-white hover:bg-gray-50"
                >
                  clear
                </button>
              </div>
              <p className="text-gray-500">
                Decision nodes should have one <code>true</code> and one <code>false</code> outgoing edge.
              </p>
            </div>
          ) : (
            <p className="text-gray-500">Select a node or edge to edit.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CatalogTaskDetailPage() {
  const navigate = useNavigate();
  const { serviceItemId = '', taskId = '' } = useParams();
  const isNew = !taskId || taskId === 'new';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showVisualBuilder, setShowVisualBuilder] = useState(false);
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [allCatalogTasks, setAllCatalogTasks] = useState<AllCatalogTask[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const automationTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [vaultCreds, setVaultCreds] = useState<TenantCredentialListItem[]>([]);
  const [form, setForm] = useState({
    service_item_id: serviceItemId,
    name: '',
    description: '',
    instructions: '',
    task_type: 'manual',
    task_order: 1,
    assigned_group_id: '',
    sla_hours: '',
    automation_config_json: '{\n  \n}',
  });

  useEffect(() => {
    let active = true;
    Promise.all([
      catalog.allItems(),
      catalog.allTasks(),
      adminApi.assignmentGroups().catch(() => ({ assignment_groups: [] })),
      credentialsApi.list().catch(() => ({ credentials: [] as TenantCredentialListItem[] })),
    ]).then(async ([itemsRes, tasksRes, groupsRes, vaultRes]) => {
      if (!active) return;
      const sorted = [...itemsRes.items].sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        const c = (a.category_name || '').localeCompare(b.category_name || '');
        if (c !== 0) return c;
        return (a.name || '').localeCompare(b.name || '');
      });
      setItems(sorted);
      setAllCatalogTasks(tasksRes.tasks);
      setGroups(groupsRes.assignment_groups);
      setVaultCreds(vaultRes.credentials);

      const effectiveItemId = serviceItemId || sorted[0]?.id || '';
      if (isNew) {
        setForm((prev) => ({ ...prev, service_item_id: effectiveItemId }));
        setLoading(false);
        return;
      }

      if (!effectiveItemId || !taskId) {
        setError('Invalid catalog task URL.');
        setLoading(false);
        return;
      }

      const taskRes = await catalog.itemTasks(effectiveItemId);
      const task = taskRes.tasks.find((t) => t.id === taskId);
      if (!task) {
        setError('Catalog task not found.');
        setLoading(false);
        return;
      }
      setForm({
        service_item_id: effectiveItemId,
        name: task.name,
        description: task.description || '',
        instructions: task.instructions || '',
        task_type: task.task_type,
        task_order: task.task_order,
        assigned_group_id: task.assigned_group_id || '',
        sla_hours: task.sla_hours ? String(task.sla_hours) : '',
        automation_config_json: JSON.stringify(task.automation_config && Object.keys(task.automation_config).length > 0
          ? task.automation_config
          : {}, null, 2),
      });
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setError('Failed to load catalog task details.');
      setLoading(false);
    });

    return () => { active = false; };
  }, [serviceItemId, taskId, isNew]);

  const selectedItemName = useMemo(
    () => items.find((i) => i.id === form.service_item_id)?.name || 'Catalog Task',
    [items, form.service_item_id],
  );

  const insertAtCursor = (snippet: string) => {
    const el = automationTextareaRef.current;
    const cur = el?.value ?? form.automation_config_json;
    if (!el) {
      setForm((prev) => ({ ...prev, automation_config_json: `${prev.automation_config_json}${snippet}` }));
      return;
    }
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const next = `${cur.slice(0, start)}${snippet}${cur.slice(end)}`;
    const caret = start + snippet.length;
    setForm((prev) => ({ ...prev, automation_config_json: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const replaceAutomationJson = (json: string) => {
    setForm((prev) => ({ ...prev, automation_config_json: json }));
    requestAnimationFrame(() => {
      const el = automationTextareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(0, json.length);
      }
    });
  };

  const taskCountsByItemId = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of allCatalogTasks) {
      m[t.service_item_id] = (m[t.service_item_id] || 0) + 1;
    }
    return m;
  }, [allCatalogTasks]);

  const handleSave = async () => {
    if (!form.service_item_id || !form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      let automation_config: Record<string, unknown> = {};
      if (form.task_type === 'automated') {
        try {
          const parsed = JSON.parse(form.automation_config_json || '{}') as unknown;
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            setError('Automation config must be a JSON object.');
            setSaving(false);
            return;
          }
          automation_config = parsed as Record<string, unknown>;
          const validationErrors = validateAutomationConfigClient(automation_config);
          if (validationErrors.length > 0) {
            setError(`Automation config is invalid: ${validationErrors.join('; ')}`);
            setSaving(false);
            return;
          }
        } catch {
          setError('Automation config is not valid JSON.');
          setSaving(false);
          return;
        }
      }

      const payload: Partial<CatalogTask> = {
        name: form.name.trim(),
        description: form.description || null,
        instructions: form.instructions || null,
        task_type: form.task_type as CatalogTask['task_type'],
        task_order: form.task_order,
        assigned_group_id: form.assigned_group_id || null,
        sla_hours: form.sla_hours ? parseInt(form.sla_hours, 10) : null,
        automation_config,
      };
      if (isNew) {
        await catalog.createItemTask(form.service_item_id, payload);
      } else {
        await catalog.updateItemTask(form.service_item_id, taskId, payload);
      }
      navigate('/admin/catalog-tasks', {
        state: catalogTasksReturnState(form.service_item_id),
      });
    } catch {
      setError('Failed to save catalog task.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  const returnListState = catalogTasksReturnState(form.service_item_id || serviceItemId);

  return (
    <>
      <PageHeader
        title={isNew ? 'New Catalog Task' : 'Catalog Task Detail'}
        description={`${isNew ? 'Create' : 'Update'} task for ${selectedItemName}.`}
        action={
          <Link
            to="/admin/catalog-tasks"
            state={returnListState}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Back to list
          </Link>
        }
      />

      <Card>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Service item *</label>
            <ServiceItemCombobox
              items={items}
              value={form.service_item_id}
              onChange={(id) => setForm({ ...form, service_item_id: id })}
              taskCounts={taskCountsByItemId}
              disabled={!isNew}
              placeholder="Search and select a service item…"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Task Type *</label>
            <select
              value={form.task_type}
              onChange={(e) => setForm((prev) => ({ ...prev, task_type: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Order Group</label>
            <input
              type="number"
              min={1}
              value={form.task_order}
              onChange={(e) => setForm({ ...form, task_order: parseInt(e.target.value, 10) || 1 })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Assigned Group</label>
            <select
              value={form.assigned_group_id}
              onChange={(e) => setForm({ ...form, assigned_group_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">-- None --</option>
              {groups.filter((g) => g.is_active).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">SLA (hours)</label>
            <input
              type="number"
              min={0}
              value={form.sla_hours}
              onChange={(e) => setForm({ ...form, sla_hours: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Optional"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Instructions</label>
            <textarea
              rows={4}
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
          {form.task_type === 'automated' && (
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Automation (JSON)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Use state-machine format: <code className="bg-gray-100 px-1 rounded">kind: &quot;state_machine&quot;</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">startAt</code>, and <code className="bg-gray-100 px-1 rounded">states[]</code>. Supported state types:{' '}
                <code className="bg-gray-100 px-1 rounded">activity</code>, <code className="bg-gray-100 px-1 rounded">decision</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">delay</code>, <code className="bg-gray-100 px-1 rounded">end</code>.{' '}
                For secrets, use <code className="bg-gray-100 px-1 rounded">{'{{cred.slug}}'}</code> with Admin → Credentials.
              </p>
              <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-1.5 mb-2">
                Task-to-task handoff: write values in Task 1 via <code className="bg-white px-1 rounded">mergeFormData</code>, then read them in Task 2 with{' '}
                <code className="bg-white px-1 rounded">{'{{request.form_data.your_key}}'}</code>. Set Task 2 to a higher{' '}
                <code className="bg-white px-1 rounded">task_order</code> so it runs after Task 1.
              </p>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-medium text-gray-600">Insert example</span>
                {AUTOMATION_SNIPPETS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (!isEmptyAutomationJson(form.automation_config_json)) {
                        const ok = window.confirm(
                          `Replace the current automation JSON with “${s.label}”?`,
                        );
                        if (!ok) return;
                      }
                      replaceAutomationJson(s.json);
                    }}
                    className="px-2 py-1 text-xs font-medium rounded-md border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-medium text-gray-600">Insert at cursor</span>
                <button
                  type="button"
                  onClick={() => setShowVisualBuilder((v) => !v)}
                  className="px-2 py-1 text-xs rounded-md border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
                >
                  {showVisualBuilder ? 'Hide visual builder' : 'Show visual builder'}
                </button>
                {vaultCreds.length > 0 && (
                  <select
                    className="text-xs border border-gray-200 rounded px-2 py-1 max-w-[220px] bg-white"
                    defaultValue=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) insertAtCursor(`{{cred.${v}}}`);
                      e.target.value = '';
                    }}
                    title="Insert vault credential reference"
                  >
                    <option value="">Vault credential…</option>
                    {vaultCreds.map((c) => (
                      <option key={c.id} value={c.slug}>{c.label} ({c.slug})</option>
                    ))}
                  </select>
                )}
                {TEMPLATE_TOKENS.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => insertAtCursor(t.token)}
                    className="px-2 py-1 text-xs rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {showVisualBuilder && (
                <div className="mb-3">
                  <ReactFlowProvider>
                    <CatalogAutomationBuilder
                      initialConfigJson={form.automation_config_json}
                      onApply={(cfg) =>
                        setForm((prev) => ({
                          ...prev,
                          automation_config_json: JSON.stringify(cfg, null, 2),
                        }))
                      }
                    />
                  </ReactFlowProvider>
                </div>
              )}
              <textarea
                ref={automationTextareaRef}
                rows={14}
                value={form.automation_config_json}
                onChange={(e) => setForm({ ...form, automation_config_json: e.target.value })}
                spellCheck={false}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
              />
            </div>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleSave}
            disabled={!form.service_item_id || !form.name.trim() || saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : (isNew ? 'Create Task' : 'Save Changes')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/catalog-tasks', { state: returnListState })}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </Card>
    </>
  );
}
