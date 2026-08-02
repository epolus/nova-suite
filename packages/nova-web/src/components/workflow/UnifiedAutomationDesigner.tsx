/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import {
  getStoreDataForIntegration,
  useChangesTrackerStore,
  useStore,
  WorkflowBuilder,
  type IntegrationDataFormat,
  type WorkflowBuilderIsValidConnection,
} from '@workflowbuilder/sdk';
import { getNodesBounds } from '@xyflow/react';
import '@workflowbuilder/sdk/style.css';
import {
  loadSdkGraphFromConfig,
  serializeSdkGraphToConfig,
} from './sdk/adapter';
import { workflowNodeTypes } from './sdk/nodeTypes';
import type { BuilderError } from './unifiedAutomationDesigner.internals';

const isValidConnection: WorkflowBuilderIsValidConnection = ({ sourceNode, targetNode }) => {
  if (sourceNode.id === targetNode.id) return false;
  if (sourceNode.data.type === 'end') return false;
  return true;
};

type FlowViewportApi = {
  fitView: (opts?: Record<string, unknown>) => unknown;
  setCenter: (x: number, y: number, opts?: Record<string, unknown>) => unknown;
  getZoom: () => number;
  getNodes: () => Array<{ id: string; position: { x: number; y: number }; measured?: { width?: number; height?: number }; width?: number; height?: number }>;
};

type CanvasChromeRects = {
  pane: DOMRect;
  visible: DOMRect;
};

/** Visible middle area between SDK chrome, relative to the React Flow pane. */
function getCanvasChromeRects(canvasRoot: Element | null): CanvasChromeRects | null {
  if (!canvasRoot) return null;
  const paneEl = canvasRoot.querySelector('.react-flow') as HTMLElement | null;
  const boundsEl = canvasRoot.querySelector('#viewport-bounds') as HTMLElement | null;
  if (!paneEl || !boundsEl) return null;
  const pane = paneEl.getBoundingClientRect();
  const visible = boundsEl.getBoundingClientRect();
  if (pane.width < 8 || pane.height < 8 || visible.width < 8 || visible.height < 8) return null;
  return { pane, visible };
}

function paddingForVisibleArea(chrome: CanvasChromeRects | null, marginPx = 24) {
  if (!chrome) return 0.12;
  const { pane, visible } = chrome;
  // xyflow treats bare numbers as relative padding factors, not pixels — use `px`.
  return {
    left: `${Math.max(0, visible.left - pane.left) + marginPx}px`,
    top: `${Math.max(0, visible.top - pane.top) + marginPx}px`,
    right: `${Math.max(0, pane.right - visible.right) + marginPx}px`,
    bottom: `${Math.max(0, pane.bottom - visible.bottom) + marginPx}px`,
  };
}

function fitDiagramToScreen(
  instance: FlowViewportApi | null | undefined,
  canvasRoot: Element | null,
) {
  if (!instance) return;
  void instance.fitView({
    padding: paddingForVisibleArea(getCanvasChromeRects(canvasRoot)),
    maxZoom: 1,
    duration: 400,
  });
}

/** Pan so node bounds center sits in the visible middle (keeps current zoom). */
function centerDiagramInView(
  instance: FlowViewportApi | null | undefined,
  canvasRoot: Element | null,
) {
  if (!instance) return;
  const nodes = instance.getNodes();
  if (nodes.length === 0) return;
  const bounds = getNodesBounds(nodes as never);
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const zoom = instance.getZoom();
  const chrome = getCanvasChromeRects(canvasRoot);
  if (!chrome) {
    void instance.setCenter(cx, cy, { zoom, duration: 400 });
    return;
  }
  const { pane, visible } = chrome;
  const paneCenterX = pane.width / 2;
  const paneCenterY = pane.height / 2;
  const visibleCenterX = visible.left - pane.left + visible.width / 2;
  const visibleCenterY = visible.top - pane.top + visible.height / 2;
  // setCenter pins a flow point to the pane center; shift target so it lands in the free area.
  const targetX = cx + (paneCenterX - visibleCenterX) / zoom;
  const targetY = cy + (paneCenterY - visibleCenterY) / zoom;
  void instance.setCenter(targetX, targetY, { zoom, duration: 400 });
}

function SyncBridge({
  onApply,
  onError,
  lastEmittedJsonRef,
}: {
  onApply: (cfg: Record<string, unknown>) => void;
  onError: (message: string) => void;
  lastEmittedJsonRef: React.MutableRefObject<string>;
}) {
  const tErrors = useTranslations('components.unifiedAutomationDesigner.errors');
  const timestamp = useChangesTrackerStore((s) => s.lastChangeTimestamp);

  const formatError = useCallback(
    (error: BuilderError) => tErrors(error.code as never, error.params as never),
    [tErrors],
  );

  useEffect(() => {
    if (!timestamp) return;
    const timer = window.setTimeout(() => {
      const data = getStoreDataForIntegration();
      const out = serializeSdkGraphToConfig(data.nodes, data.edges);
      if (!out.config) {
        onError(out.errors.map(formatError).join(' '));
        return;
      }
      onError('');
      const json = JSON.stringify(out.config, null, 2);
      lastEmittedJsonRef.current = json;
      onApply(out.config);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [timestamp, onApply, onError, formatError, lastEmittedJsonRef]);

  return null;
}

function FitViewBridge({
  canvasRootRef,
  fitToScreenRef,
  centerViewRef,
  autoFit,
}: {
  canvasRootRef: React.RefObject<HTMLElement | null>;
  fitToScreenRef: React.MutableRefObject<(() => void) | null>;
  centerViewRef: React.MutableRefObject<(() => void) | null>;
  autoFit: boolean;
}) {
  const reactFlowInstance = useStore((s) => s.reactFlowInstance) as FlowViewportApi | null;

  const fitToScreen = useCallback(() => {
    fitDiagramToScreen(reactFlowInstance, canvasRootRef.current);
  }, [reactFlowInstance, canvasRootRef]);

  const centerView = useCallback(() => {
    centerDiagramInView(reactFlowInstance, canvasRootRef.current);
  }, [reactFlowInstance, canvasRootRef]);

  useEffect(() => {
    fitToScreenRef.current = fitToScreen;
    centerViewRef.current = centerView;
    return () => {
      fitToScreenRef.current = null;
      centerViewRef.current = null;
    };
  }, [fitToScreen, centerView, fitToScreenRef, centerViewRef]);

  useEffect(() => {
    if (!autoFit || !reactFlowInstance) return;
    // Wait for chrome + node measurement before the initial fit.
    const timer = window.setTimeout(() => {
      fitDiagramToScreen(reactFlowInstance, canvasRootRef.current);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [autoFit, reactFlowInstance, canvasRootRef]);

  return null;
}

function UnifiedAutomationDesignerInner({
  initialConfigJson,
  onApply,
}: {
  initialConfigJson: string;
  onApply: (cfg: Record<string, unknown>) => void;
}) {
  const t = useTranslations('components.unifiedAutomationDesigner');
  const tErrors = useTranslations('components.unifiedAutomationDesigner.errors');
  const lastEmittedJsonRef = useRef('');
  const canvasRootRef = useRef<HTMLDivElement | null>(null);
  const fitToScreenRef = useRef<(() => void) | null>(null);
  const centerViewRef = useRef<(() => void) | null>(null);
  const [builderError, setBuilderError] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const skipNextRemountRef = useRef(false);

  const formatError = useCallback(
    (error: BuilderError) => tErrors(error.code as never, error.params as never),
    [tErrors],
  );

  const loaded = useMemo(() => {
    try {
      const raw = JSON.parse(initialConfigJson || '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { nodes: [], edges: [], error: { code: 'jsonMustBeObject' } as BuilderError };
      }
      return loadSdkGraphFromConfig(raw as Record<string, unknown>);
    } catch {
      return { nodes: [], edges: [], error: { code: 'jsonInvalid' } as BuilderError };
    }
  }, [initialConfigJson]);

  useEffect(() => {
    if (initialConfigJson && initialConfigJson === lastEmittedJsonRef.current) return;
    if (skipNextRemountRef.current) {
      skipNextRemountRef.current = false;
      lastEmittedJsonRef.current = initialConfigJson;
      return;
    }
    if (loaded.error) {
      setBuilderError(formatError(loaded.error));
      return;
    }
    setBuilderError('');
    setEditorKey((k) => k + 1);
  }, [formatError, initialConfigJson, loaded]);

  const handleSave = useCallback(
    async (data: IntegrationDataFormat) => {
      const out = serializeSdkGraphToConfig(data.nodes, data.edges);
      if (!out.config) {
        setBuilderError(out.errors.map(formatError).join(' '));
        return 'error' as const;
      }
      setBuilderError('');
      const json = JSON.stringify(out.config, null, 2);
      lastEmittedJsonRef.current = json;
      skipNextRemountRef.current = true;
      onApply(out.config);
      return 'success' as const;
    },
    [formatError, onApply],
  );

  const handleApplyFromSync = useCallback(
    (cfg: Record<string, unknown>) => {
      skipNextRemountRef.current = true;
      onApply(cfg);
    },
    [onApply],
  );

  // Push loaded/default graph into the parent JSON once per editor mount.
  useEffect(() => {
    if (loaded.error || loaded.nodes.length === 0) return;
    const out = serializeSdkGraphToConfig(loaded.nodes, loaded.edges);
    if (!out.config) return;
    const json = JSON.stringify(out.config, null, 2);
    if (json === lastEmittedJsonRef.current || json === initialConfigJson) return;
    lastEmittedJsonRef.current = json;
    skipNextRemountRef.current = true;
    onApply(out.config);
  }, [editorKey, loaded, initialConfigJson, onApply]);

  const nodeCount = loaded.error ? 0 : loaded.nodes.length;

  return (
    <div className="catalog-automation-builder workflow-builder-sdk border border-gray-200 rounded-lg p-3 bg-white">
      <div className="flex flex-wrap items-center gap-2 mb-2 justify-between">
        <span className="text-[11px] text-gray-500">{t('jsonSyncAutomatic')}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => centerViewRef.current?.()}
            disabled={nodeCount === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            {t('centerView')}
          </button>
          <button
            type="button"
            onClick={() => fitToScreenRef.current?.()}
            disabled={nodeCount === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            {t('fitToScreen')}
          </button>
        </div>
      </div>
      {builderError && (
        <div className="mb-2 p-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200">{builderError}</div>
      )}
      <div
        ref={canvasRootRef}
        className="h-[520px] border border-gray-200 rounded-md overflow-hidden relative workflow-builder-sdk__canvas"
      >
        <WorkflowBuilder.Root
          key={editorKey}
          name="automation"
          layoutDirection="RIGHT"
          nodeTypes={workflowNodeTypes}
          initialNodes={loaded.error ? [] : loaded.nodes}
          initialEdges={loaded.error ? [] : loaded.edges}
          isValidConnection={isValidConnection}
          integration={{
            strategy: 'props',
            onDataSave: handleSave,
          }}
        >
          <WorkflowBuilder.DefaultLayout />
          <SyncBridge
            onApply={handleApplyFromSync}
            onError={setBuilderError}
            lastEmittedJsonRef={lastEmittedJsonRef}
          />
          <FitViewBridge
            canvasRootRef={canvasRootRef}
            fitToScreenRef={fitToScreenRef}
            centerViewRef={centerViewRef}
            autoFit={nodeCount > 0}
          />
        </WorkflowBuilder.Root>
      </div>
    </div>
  );
}

export default function UnifiedAutomationDesigner(props: {
  initialConfigJson: string;
  onApply: (cfg: Record<string, unknown>) => void;
}) {
  return <UnifiedAutomationDesignerInner {...props} />;
}
