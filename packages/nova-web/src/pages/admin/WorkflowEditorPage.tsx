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
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './WorkflowEditorPage.css';
import { admin, type WorkflowDefinition } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import type {
  BuilderGraph,
  BuilderNodeData,
  BuilderNodeType,
  TemporalWorkflowJson,
} from './workflow-editor/types';
import { autoLayoutGraph, getNodeType, serializeWorkflow } from './workflow-editor/workflowSerializer';
import { diffObjects, formatDiffValue } from './workflow-editor/diff';

type PersistedBuilderDefinition = {
  workflowType: string;
  graph: {
    nodes: Node<BuilderNodeData>[];
    edges: Edge[];
  };
  generated: TemporalWorkflowJson;
};

const palette: Array<{ type: BuilderNodeType; label: string; help: string }> = [
  { type: 'start', label: 'Start', help: 'Single workflow entry point' },
  { type: 'activity', label: 'Activity', help: 'Temporal activity invocation' },
  { type: 'decision', label: 'Decision', help: 'Branch based on expression' },
  { type: 'delay', label: 'Delay', help: 'Wait/sleep before next step' },
  { type: 'end', label: 'End', help: 'Workflow terminal state' },
];

const initialNodes: Node<BuilderNodeData>[] = [
  {
    id: 'start-1',
    type: 'default',
    position: { x: 100, y: 200 },
    data: { label: 'Start' },
  },
  {
    id: 'end-1',
    type: 'default',
    position: { x: 520, y: 200 },
    data: { label: 'End' },
  },
];

const initialEdges: Edge[] = [
  {
    id: 'start-1->end-1',
    source: 'start-1',
    target: 'end-1',
    markerEnd: { type: MarkerType.ArrowClosed },
  },
];

function nextId(prefix: BuilderNodeType) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function EditorCanvas() {
  const { screenToFlowPosition } = useReactFlow();
  const [definitionId, setDefinitionId] = useState<string | null>(null);
  const [definitionName, setDefinitionName] = useState('New Workflow Definition');
  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
  const [loadingDefinitions, setLoadingDefinitions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadedPublishedDefinition, setLoadedPublishedDefinition] = useState<Record<string, unknown> | null>(null);
  const [loadedVersion, setLoadedVersion] = useState<number>(0);
  const [loadedPublishedAt, setLoadedPublishedAt] = useState<string | null>(null);
  const [workflowType, setWorkflowType] = useState('ticket-triage-workflow');
  const [nodes, setNodes] = useState<Node<BuilderNodeData>[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [past, setPast] = useState<BuilderGraph[]>([]);
  const [future, setFuture] = useState<BuilderGraph[]>([]);
  const restoringRef = useRef(false);

  const selectedNode = nodes.find((n) => n.selected) ?? null;
  const selectedType = selectedNode ? getNodeType(selectedNode) : null;

  const pushHistory = useCallback(() => {
    if (restoringRef.current) return;
    setPast((prev) => [...prev.slice(-49), { nodes, edges }]);
    setFuture([]);
  }, [nodes, edges]);

  const applyGraph = useCallback((graph: BuilderGraph) => {
    restoringRef.current = true;
    setNodes(graph.nodes);
    setEdges(graph.edges);
    queueMicrotask(() => {
      restoringRef.current = false;
    });
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<Node<BuilderNodeData>>[]) => {
    const shouldSnapshot = changes.some((change) => change.type !== 'select');
    if (shouldSnapshot) pushHistory();
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, [pushHistory]);

  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    const shouldSnapshot = changes.some((change) => change.type !== 'select');
    if (shouldSnapshot) pushHistory();
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, [pushHistory]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const sourceNode = nodes.find((n) => n.id === connection.source);
      if (!sourceNode) return;

      const sourceType = getNodeType(sourceNode);
      const existingFromSource = edges.filter((e) => e.source === connection.source);
      let label: string | undefined;

      if (sourceType === 'decision') {
        if (existingFromSource.length >= 2) return;
        const existingLabels = new Set(existingFromSource.map((e) => (typeof e.label === 'string' ? e.label : undefined)));
        label = existingLabels.has('true') ? 'false' : 'true';
      }

      pushHistory();
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            label,
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds,
        ),
      );
    },
    [edges, nodes, pushHistory],
  );

  const onDragStart = useCallback((evt: React.DragEvent<HTMLButtonElement>, nodeType: BuilderNodeType) => {
    evt.dataTransfer.setData('application/x-wf-node-type', nodeType);
    evt.dataTransfer.effectAllowed = 'move';
  }, []);

  const onDragOver = useCallback((evt: React.DragEvent<HTMLDivElement>) => {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (evt: React.DragEvent<HTMLDivElement>) => {
      evt.preventDefault();
      const nodeType = evt.dataTransfer.getData('application/x-wf-node-type') as BuilderNodeType;
      if (!palette.some((p) => p.type === nodeType)) return;

      const position = screenToFlowPosition({ x: evt.clientX, y: evt.clientY });
      const label = nodeType.charAt(0).toUpperCase() + nodeType.slice(1);
      const id = nextId(nodeType);

      pushHistory();
      setNodes((nds) =>
        nds.concat({
          id,
          position,
          data: {
            label,
            activityName: nodeType === 'activity' ? 'notifyAssignee' : undefined,
            timeoutSec: nodeType === 'activity' ? 30 : undefined,
            retryAttempts: nodeType === 'activity' ? 3 : undefined,
            retryBackoffSec: nodeType === 'activity' ? 5 : undefined,
            onError: nodeType === 'activity' ? 'fail' : undefined,
            condition: nodeType === 'decision' ? 'input.priority === "high"' : undefined,
            delaySeconds: nodeType === 'delay' ? 300 : undefined,
          },
        }),
      );
    },
    [pushHistory, screenToFlowPosition],
  );

  const serialized = useMemo(
    () => serializeWorkflow({ nodes, edges }, workflowType),
    [nodes, edges, workflowType],
  );
  const temporalJson = serialized.workflow;
  const validationErrors = serialized.validation.errors;
  const validationWarnings = serialized.validation.warnings;

  const updateSelectedNode = (patch: Partial<BuilderNodeData>) => {
    if (!selectedNode) return;
    pushHistory();
    setNodes((nds) =>
      nds.map((node) =>
        node.id === selectedNode.id ? { ...node, data: { ...node.data, ...patch } } : node,
      ),
    );
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(temporalJson, null, 2));
  };

  const serializedDraft = useMemo<PersistedBuilderDefinition>(
    () => ({
      workflowType,
      graph: { nodes, edges },
      generated: temporalJson,
    }),
    [workflowType, nodes, edges, temporalJson],
  );
  const diffChanges = useMemo(() => {
    if (!loadedPublishedDefinition) return [];
    return diffObjects(
      loadedPublishedDefinition,
      serializedDraft as unknown as Record<string, unknown>,
    );
  }, [loadedPublishedDefinition, serializedDraft]);
  const hasPublished = loadedPublishedDefinition !== null;

  const refreshDefinitions = useCallback(async () => {
    setLoadingDefinitions(true);
    try {
      const result = await admin.workflowDefinitions();
      setDefinitions(result.workflow_definitions);
    } finally {
      setLoadingDefinitions(false);
    }
  }, []);

  useEffect(() => {
    void refreshDefinitions();
  }, [refreshDefinitions]);

  const resetEditor = () => {
    setDefinitionId(null);
    setDefinitionName('New Workflow Definition');
    setWorkflowType('ticket-triage-workflow');
    applyGraph({ nodes: initialNodes, edges: initialEdges });
    setLoadedPublishedDefinition(null);
    setLoadedVersion(0);
    setLoadedPublishedAt(null);
    setPast([]);
    setFuture([]);
    setMessage('Started a new draft');
  };

  const loadDefinition = async (id: string) => {
    setBusy(true);
    try {
      const result = await admin.workflowDefinition(id);
      const def = result.workflow_definition;
      const draft = def.draft_definition as Partial<PersistedBuilderDefinition>;
      const draftNodes = Array.isArray(draft.graph?.nodes) ? draft.graph.nodes as Node<BuilderNodeData>[] : initialNodes;
      const draftEdges = Array.isArray(draft.graph?.edges) ? draft.graph.edges as Edge[] : initialEdges;

      setDefinitionId(def.id);
      setDefinitionName(def.name);
      setWorkflowType(typeof draft.workflowType === 'string' ? draft.workflowType : def.workflow_type);
      setLoadedPublishedDefinition(def.published_definition);
      setLoadedVersion(def.version);
      setLoadedPublishedAt(def.published_at);
      applyGraph({
        nodes: draftNodes.length > 0 ? draftNodes : initialNodes,
        edges: draftEdges,
      });
      setPast([]);
      setFuture([]);
      setMessage(`Loaded "${def.name}"`);
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    if (!definitionName.trim()) {
      setMessage('Name is required to save');
      return;
    }
    if (!workflowType.trim()) {
      setMessage('Workflow type is required to save');
      return;
    }

    setBusy(true);
    try {
      if (!definitionId) {
        const created = await admin.createWorkflowDefinition({
          name: definitionName.trim(),
          workflow_type: workflowType.trim(),
          draft_definition: serializedDraft as unknown as Record<string, unknown>,
        });
        setDefinitionId(created.id);
      } else {
        await admin.updateWorkflowDefinition(definitionId, {
          name: definitionName.trim(),
          workflow_type: workflowType.trim(),
          draft_definition: serializedDraft as unknown as Record<string, unknown>,
        });
      }
      await refreshDefinitions();
      setMessage('Draft saved');
    } finally {
      setBusy(false);
    }
  };

  const publishDefinition = async () => {
    if (!definitionId) {
      setMessage('Save draft first before publishing');
      return;
    }
    if (validationErrors.length > 0) {
      setMessage(`Cannot publish: ${validationErrors.length} validation error(s).`);
      return;
    }
    setBusy(true);
    try {
      await admin.publishWorkflowDefinition(definitionId, {
        draft_definition: serializedDraft as unknown as Record<string, unknown>,
      });
      setLoadedPublishedDefinition(serializedDraft as unknown as Record<string, unknown>);
      setLoadedVersion((v) => v + 1);
      setLoadedPublishedAt(new Date().toISOString());
      await refreshDefinitions();
      setMessage('Published new version');
    } finally {
      setBusy(false);
    }
  };

  const duplicateDefinition = async () => {
    if (!definitionId) {
      setMessage('Load or save a definition before duplicating');
      return;
    }
    setBusy(true);
    try {
      const result = await admin.duplicateWorkflowDefinition(definitionId);
      await refreshDefinitions();
      await loadDefinition(result.id);
      setMessage('Duplicated definition');
    } finally {
      setBusy(false);
    }
  };

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    if (!previous) return;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [{ nodes, edges }, ...f.slice(0, 49)]);
    applyGraph(previous);
    setMessage('Undid last change');
  }, [applyGraph, edges, nodes, past]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const [next, ...rest] = future;
    if (!next) return;
    setFuture(rest);
    setPast((p) => [...p.slice(-49), { nodes, edges }]);
    applyGraph(next);
    setMessage('Redid change');
  }, [applyGraph, edges, future, nodes]);

  const autoLayout = useCallback(() => {
    pushHistory();
    const next = autoLayoutGraph({ nodes, edges });
    applyGraph(next);
    setMessage('Applied auto-layout');
  }, [applyGraph, edges, nodes, pushHistory]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isUndo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey;
      const isRedo =
        (event.ctrlKey || event.metaKey) &&
        (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey));
      if (isUndo) {
        event.preventDefault();
        undo();
      } else if (isRedo) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo]);

  return (
    <>
      <PageHeader
        title="Workflow Editor"
        description="Drag nodes, connect flow logic, and save/publish Temporal-ready definitions."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={saveDraft}
              disabled={busy}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              Save Draft
            </button>
            <button
              onClick={publishDefinition}
              disabled={busy || !definitionId || validationErrors.length > 0}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
            >
              Publish
            </button>
          </div>
        }
      />

      <div className="mb-4 bg-white rounded-xl border border-gray-200 p-3">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-end">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Definition Name</label>
            <input
              value={definitionName}
              onChange={(e) => setDefinitionName(e.target.value)}
              className="w-full px-2.5 py-2 rounded border border-gray-200 text-sm"
              placeholder="Incident triage v1"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Saved Definitions</label>
            <select
              value={definitionId ?? ''}
              disabled={loadingDefinitions || busy}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                void loadDefinition(id);
              }}
              className="w-full px-2.5 py-2 rounded border border-gray-200 text-sm bg-white"
            >
              <option value="">Select...</option>
              {definitions.map((def) => (
                <option key={def.id} value={def.id}>
                  {def.name} ({def.workflow_type}) v{def.version}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={resetEditor}
              disabled={busy}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              New
            </button>
            <button
              onClick={duplicateDefinition}
              disabled={busy || !definitionId}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Duplicate
            </button>
            <button
              onClick={undo}
              disabled={past.length === 0 || busy}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Undo
            </button>
            <button
              onClick={redo}
              disabled={future.length === 0 || busy}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Redo
            </button>
            <button
              onClick={autoLayout}
              disabled={busy}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Auto-layout
            </button>
          </div>
          <div className="flex justify-end">
            <button
              onClick={copyJson}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              Copy JSON
            </button>
          </div>
        </div>
        {message && <p className="mt-2 text-xs text-gray-600">{message}</p>}
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
          <p className="text-xs font-semibold text-gray-700 mb-1">Draft vs Published</p>
          {!hasPublished ? (
            <p className="text-xs text-gray-600">No published version yet. Publish this draft to establish a baseline.</p>
          ) : (
            <>
              <p className="text-xs text-gray-600 mb-2">
                Published version: v{loadedVersion}
                {loadedPublishedAt ? ` at ${new Date(loadedPublishedAt).toLocaleString()}` : ''}
              </p>
              <p className="text-xs text-gray-700 mb-2">
                {diffChanges.length === 0
                  ? 'Draft matches published.'
                  : `${diffChanges.length} field-level change(s) since publish.`}
              </p>
              {diffChanges.length > 0 && (
                <div className="max-h-40 overflow-auto bg-white border border-gray-200 rounded p-2">
                  <ul className="text-xs text-gray-700 space-y-2">
                    {diffChanges.slice(0, 40).map((change, idx) => (
                      <li key={`${change.path}-${idx}`}>
                        <p className="font-medium">- [{change.kind}] {change.path}</p>
                        <p className="text-[11px] text-gray-600">
                          before: <span className="font-mono">{formatDiffValue(change.before)}</span>
                        </p>
                        <p className="text-[11px] text-gray-600">
                          after: <span className="font-mono">{formatDiffValue(change.after)}</span>
                        </p>
                      </li>
                    ))}
                    {diffChanges.length > 40 && <li>- ... {diffChanges.length - 40} more</li>}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
        {(validationErrors.length > 0 || validationWarnings.length > 0) && (
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5">
              <p className="text-xs font-semibold text-red-700 mb-1">Validation Errors ({validationErrors.length})</p>
              {validationErrors.length === 0 ? (
                <p className="text-xs text-red-500">None</p>
              ) : (
                <ul className="text-xs text-red-700 space-y-1">
                  {validationErrors.slice(0, 6).map((error, index) => (
                    <li key={`${error}-${index}`}>- {error}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
              <p className="text-xs font-semibold text-amber-700 mb-1">Warnings ({validationWarnings.length})</p>
              {validationWarnings.length === 0 ? (
                <p className="text-xs text-amber-600">None</p>
              ) : (
                <ul className="text-xs text-amber-700 space-y-1">
                  {validationWarnings.slice(0, 6).map((warning, index) => (
                    <li key={`${warning}-${index}`}>- {warning}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="workflow-editor grid grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[640px]">
        <aside className="col-span-12 lg:col-span-2 bg-white rounded-xl border border-gray-200 p-3 overflow-auto">
          <p className="text-sm font-semibold text-gray-900 mb-2">Palette</p>
          <p className="text-xs text-gray-500 mb-3">Drag any block into the canvas.</p>
          <div className="space-y-2">
            {palette.map((item) => (
              <button
                key={item.type}
                draggable
                onDragStart={(evt) => onDragStart(evt, item.type)}
                className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
              >
                <p className="text-sm font-medium text-gray-800">{item.label}</p>
                <p className="text-xs text-gray-500">{item.help}</p>
              </button>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100">
            <label className="block text-xs font-medium text-gray-600 mb-1">Workflow Type</label>
            <input
              value={workflowType}
              onChange={(e) => setWorkflowType(e.target.value)}
              className="w-full px-2.5 py-2 rounded border border-gray-200 text-sm"
            />
          </div>
        </aside>

        <section
          className="col-span-12 lg:col-span-7 bg-white rounded-xl border border-gray-200 overflow-hidden"
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow<Node<BuilderNodeData>, Edge>
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </section>

        <aside className="col-span-12 lg:col-span-3 space-y-4 overflow-auto">
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-sm font-semibold text-gray-900 mb-2">Node Details</p>
            {!selectedNode ? (
              <p className="text-sm text-gray-400">Select a node to edit properties.</p>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                  <input
                    value={selectedNode.data.label}
                    onChange={(e) => updateSelectedNode({ label: e.target.value })}
                    className="w-full px-2.5 py-2 rounded border border-gray-200 text-sm"
                  />
                </div>
                {selectedType === 'activity' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Activity Name</label>
                      <input
                        value={selectedNode.data.activityName ?? ''}
                        onChange={(e) => updateSelectedNode({ activityName: e.target.value })}
                        className="w-full px-2.5 py-2 rounded border border-gray-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Timeout Seconds</label>
                      <input
                        type="number"
                        min={1}
                        value={selectedNode.data.timeoutSec ?? 30}
                        onChange={(e) => updateSelectedNode({ timeoutSec: Number(e.target.value) || 1 })}
                        className="w-full px-2.5 py-2 rounded border border-gray-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Retry Attempts</label>
                      <input
                        type="number"
                        min={1}
                        value={selectedNode.data.retryAttempts ?? 3}
                        onChange={(e) => updateSelectedNode({ retryAttempts: Number(e.target.value) || 1 })}
                        className="w-full px-2.5 py-2 rounded border border-gray-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Retry Backoff Seconds</label>
                      <input
                        type="number"
                        min={0}
                        value={selectedNode.data.retryBackoffSec ?? 5}
                        onChange={(e) => updateSelectedNode({ retryBackoffSec: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full px-2.5 py-2 rounded border border-gray-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">On Error</label>
                      <select
                        value={selectedNode.data.onError ?? 'fail'}
                        onChange={(e) =>
                          updateSelectedNode({
                            onError: e.target.value as BuilderNodeData['onError'],
                            fallbackNodeId: e.target.value === 'fallback' ? selectedNode.data.fallbackNodeId : undefined,
                          })
                        }
                        className="w-full px-2.5 py-2 rounded border border-gray-200 text-sm bg-white"
                      >
                        <option value="fail">Fail Workflow</option>
                        <option value="continue">Continue</option>
                        <option value="fallback">Go to Fallback Node</option>
                      </select>
                    </div>
                    {selectedNode.data.onError === 'fallback' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Fallback Node</label>
                        <select
                          value={selectedNode.data.fallbackNodeId ?? ''}
                          onChange={(e) => updateSelectedNode({ fallbackNodeId: e.target.value || undefined })}
                          className="w-full px-2.5 py-2 rounded border border-gray-200 text-sm bg-white"
                        >
                          <option value="">Select node</option>
                          {nodes
                            .filter((n) => n.id !== selectedNode.id)
                            .map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.data.label}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </>
                )}
                {selectedType === 'decision' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Condition Expression</label>
                    <textarea
                      rows={3}
                      value={selectedNode.data.condition ?? ''}
                      onChange={(e) => updateSelectedNode({ condition: e.target.value })}
                      className="w-full px-2.5 py-2 rounded border border-gray-200 text-sm"
                    />
                  </div>
                )}
                {selectedType === 'delay' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Delay Seconds</label>
                    <input
                      type="number"
                      min={1}
                      value={selectedNode.data.delaySeconds ?? 60}
                      onChange={(e) => updateSelectedNode({ delaySeconds: Number(e.target.value) || 1 })}
                      className="w-full px-2.5 py-2 rounded border border-gray-200 text-sm"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-sm font-semibold text-gray-900 mb-2">Temporal JSON</p>
            <pre className="text-xs bg-gray-50 rounded p-2.5 overflow-auto max-h-[420px]">
              {JSON.stringify(temporalJson, null, 2)}
            </pre>
          </div>
        </aside>
      </div>
    </>
  );
}

export default function WorkflowEditorPage() {
  return (
    <ReactFlowProvider>
      <EditorCanvas />
    </ReactFlowProvider>
  );
}
