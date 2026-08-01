/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
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
  UNIFIED_BUILDER_EMPTY_ATTRIBUTES_JSON,
  UNIFIED_BUILDER_NODE_DEFAULTS,
  UNIFIED_BUILDER_PARSE_FALLBACK_EXPRESSION,
} from '@nova-suite/shared';
import type { UnifiedBuilderNodeType } from '@nova-suite/shared';
import {
  autoLayoutBuilderGraph,
  nextBuilderId,
  parseBuilderFromConfig,
  resolveBuilderNodeType,
  serializeBuilderToConfig,
  UNIFIED_PALETTE_TYPES,
  UNIFIED_NODE_TYPE_MESSAGE_KEYS,
  type BuilderError,
  type UnifiedBuilderNodeData,
} from './unifiedAutomationDesigner.internals';
import '@xyflow/react/dist/style.css';

function UnifiedAutomationDesignerInner({
  initialConfigJson,
  onApply,
}: {
  initialConfigJson: string;
  onApply: (cfg: Record<string, unknown>) => void;
}) {
  const t = useTranslations('components.unifiedAutomationDesigner');
  const tErrors = useTranslations('components.unifiedAutomationDesigner.errors');
  const tNodeTypes = useTranslations('components.unifiedAutomationDesigner.nodeTypes');
  const lastEmittedJsonRef = useRef('');

  const formatError = useCallback(
    (error: BuilderError) => tErrors(error.code as never, error.params as never),
    [tErrors],
  );
  const formatErrors = useCallback(
    (errors: BuilderError[]) => errors.map(formatError).join(' '),
    [formatError],
  );

  const parsed = useMemo(() => {
    try {
      const raw = JSON.parse(initialConfigJson || '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { nodes: [], edges: [], error: { code: 'jsonMustBeObject' } as BuilderError };
      }
      return parseBuilderFromConfig(raw as Record<string, unknown>);
    } catch {
      return { nodes: [], edges: [], error: { code: 'jsonInvalid' } as BuilderError };
    }
  }, [initialConfigJson]);
  const [nodes, setNodes] = useState<Node<UnifiedBuilderNodeData>[]>(parsed.nodes);
  const [edges, setEdges] = useState<Edge[]>(parsed.edges);
  const [builderError, setBuilderError] = useState<string>(parsed.error ? formatError(parsed.error) : '');
  const selectedNode = nodes.find((n) => n.selected);
  const selectedEdge = edges.find((e) => e.selected);

  useEffect(() => {
    if (initialConfigJson && initialConfigJson === lastEmittedJsonRef.current) return;
    if (parsed.error) {
      setBuilderError(formatError(parsed.error));
      return;
    }
    setBuilderError('');
    setNodes(autoLayoutBuilderGraph(parsed.nodes, parsed.edges));
    setEdges(parsed.edges);
  }, [formatError, initialConfigJson, parsed]);

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
      setBuilderError(formatError({ code: 'onlyOneStartAllowed' }));
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
      setBuilderError(formatError({ code: 'startCannotDelete' }));
      return;
    }
    setBuilderError('');
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
  }, [selectedNode, formatError]);

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
        setBuilderError(formatErrors(out.errors));
        return;
      }
      setBuilderError('');
      const json = JSON.stringify(out.config, null, 2);
      lastEmittedJsonRef.current = json;
      onApply(out.config);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [nodes, edges, onApply, formatErrors]);

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
        {UNIFIED_PALETTE_TYPES.map((type) => (
          <button key={type} type="button" onClick={() => addNode(type)} className="px-2 py-1 text-xs rounded-md border border-gray-200 bg-white hover:bg-gray-50">
            + {tNodeTypes(UNIFIED_NODE_TYPE_MESSAGE_KEYS[type] as never)}
          </button>
        ))}
        <button type="button" onClick={autoLayout} className="ml-auto px-2 py-1 text-xs rounded-md border border-gray-200 bg-white hover:bg-gray-50">
          {t('autoFormat')}
        </button>
        <button type="button" onClick={removeSelectedNode} disabled={!selectedNode} className="px-2 py-1 text-xs rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50">
          {t('removeNode')}
        </button>
        <button type="button" onClick={removeSelectedEdge} disabled={!selectedEdge} className="px-2 py-1 text-xs rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50">
          {t('removeEdge')}
        </button>
        <span className="text-[11px] text-gray-500">{t('jsonSyncAutomatic')}</span>
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
          {!selectedNode && !selectedEdge && <p className="text-gray-500">{t('selectNodeOrEdge')}</p>}
          {selectedEdge && (
            <div className="space-y-2">
              <div>
                <label className="block text-gray-500 mb-1">{t('edgeLabelCondition')}</label>
                <input
                  value={typeof selectedEdge.label === 'string' ? selectedEdge.label : ''}
                  onChange={(e) => updateSelectedEdgeLabel(e.target.value)}
                  placeholder={t('edgeLabelPlaceholder')}
                  className="w-full border border-gray-200 rounded px-2 py-1 font-mono"
                />
              </div>
            </div>
          )}
          {selectedNode && (
            <div className="space-y-2">
              <div>
                <label className="block text-gray-500 mb-1">{t('label')}</label>
                <input value={selectedNode.data.label || ''} onChange={(e) => updateSelected({ label: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1" />
              </div>
              {(resolveBuilderNodeType(selectedNode) === 'activity' || resolveBuilderNodeType(selectedNode) === 'action.rest') && (
                <>
                  <div>
                    <label className="block text-gray-500 mb-1">{t('method')}</label>
                    <input value={selectedNode.data.method || 'GET'} onChange={(e) => updateSelected({ method: e.target.value.toUpperCase() })} className="w-full border border-gray-200 rounded px-2 py-1 font-mono" />
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-1">{t('url')}</label>
                    <input value={selectedNode.data.url || ''} onChange={(e) => updateSelected({ url: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1 font-mono" />
                  </div>
                </>
              )}
              {resolveBuilderNodeType(selectedNode) === 'decision' && (
                <div>
                  <label className="block text-gray-500 mb-1">{t('condition')}</label>
                  <input value={selectedNode.data.condition || ''} onChange={(e) => updateSelected({ condition: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1 font-mono" />
                </div>
              )}
              {resolveBuilderNodeType(selectedNode) === 'decision.advanced' && (
                <div>
                  <label className="block text-gray-500 mb-1">{t('expressionJson')}</label>
                  <textarea rows={6} value={selectedNode.data.expressionJson || '{\n  "op": "eq",\n  "left": { "var": "response.status" },\n  "right": 200\n}'} onChange={(e) => updateSelected({ expressionJson: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1 font-mono" />
                </div>
              )}
              {resolveBuilderNodeType(selectedNode) === 'delay' && (
                <div>
                  <label className="block text-gray-500 mb-1">{t('delaySeconds')}</label>
                  <input type="number" min={1} value={selectedNode.data.delaySeconds || 5} onChange={(e) => updateSelected({ delaySeconds: parseInt(e.target.value, 10) || 1 })} className="w-full border border-gray-200 rounded px-2 py-1" />
                </div>
              )}
              {(resolveBuilderNodeType(selectedNode) === 'action.ci.lookup' || resolveBuilderNodeType(selectedNode) === 'action.ci.create') && (
                <>
                  <div>
                    <label className="block text-gray-500 mb-1">{t('url')}</label>
                    <input value={selectedNode.data.url || ''} onChange={(e) => updateSelected({ url: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1 font-mono" />
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-1">{t('className')}</label>
                    <input value={selectedNode.data.className || ''} onChange={(e) => updateSelected({ className: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1" />
                  </div>
                </>
              )}
              {resolveBuilderNodeType(selectedNode) === 'action.ci.create' && (
                <>
                  <div>
                    <label className="block text-gray-500 mb-1">{t('ciNameTemplate')}</label>
                    <input value={selectedNode.data.ciName || ''} onChange={(e) => updateSelected({ ciName: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1 font-mono" />
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-1">{t('displayNameTemplate')}</label>
                    <input value={selectedNode.data.displayName || ''} onChange={(e) => updateSelected({ displayName: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1 font-mono" />
                  </div>
                </>
              )}
              {(resolveBuilderNodeType(selectedNode) === 'action.ci.lookup' || resolveBuilderNodeType(selectedNode) === 'action.ci.create') && (
                <div>
                  <label className="block text-gray-500 mb-1">{t('attributesJson')}</label>
                  <textarea rows={5} value={selectedNode.data.attributesJson || '{\n  \n}'} onChange={(e) => updateSelected({ attributesJson: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1 font-mono" />
                </div>
              )}
              {resolveBuilderNodeType(selectedNode) === 'end' && (
                <div>
                  <label className="block text-gray-500 mb-1">{t('result')}</label>
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
