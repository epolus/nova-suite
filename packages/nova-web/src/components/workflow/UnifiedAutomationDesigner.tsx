/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import {
  getStoreDataForIntegration,
  useChangesTrackerStore,
  WorkflowBuilder,
  type IntegrationDataFormat,
  type WorkflowBuilderIsValidConnection,
} from '@workflowbuilder/sdk';
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

  return (
    <div className="catalog-automation-builder workflow-builder-sdk border border-gray-200 rounded-lg p-3 bg-white">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-[11px] text-gray-500">{t('jsonSyncAutomatic')}</span>
      </div>
      {builderError && (
        <div className="mb-2 p-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">{builderError}</div>
      )}
      <div className="h-[520px] border border-gray-200 rounded-md overflow-hidden relative workflow-builder-sdk__canvas">
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
