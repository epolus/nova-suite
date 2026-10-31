/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import PageHeader from '../../components/PageHeader';
import UnifiedAutomationDesigner, {
  type UnifiedAutomationDesignerHandle,
} from '../../components/workflow/UnifiedAutomationDesigner';
import UnsavedChangesDialog from '../../components/ui/UnsavedChangesDialog';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { useLatestRef } from '../../hooks/useLatestRef';
import { admin, type WorkflowDefinition } from '../../api/client';
import { diffObjects } from './workflow-editor/diff';
import { WorkflowEditorSidePanel, WorkflowEditorToolbar } from './WorkflowEditorToolbar';
import {
  normalizeLoadedDefinition,
  stableConfigJson,
  defaultAutomationConfigJson,
  isPersistableAutomationConfig,
  type EditorSnapshot,
  type PersistedUnifiedDefinition,
} from './workflow-editor/definition';

export default function WorkflowEditorPage() {
  const t = useTranslations('pages.admin.workflows.editor');
  const [definitionId, setDefinitionId] = useState<string | null>(null);
  const [definitionName, setDefinitionName] = useState(() => t('newDefinition'));
  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
  const [loadingDefinitions, setLoadingDefinitions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadedPublishedDefinition, setLoadedPublishedDefinition] = useState<Record<string, unknown> | null>(null);
  const [loadedVersion, setLoadedVersion] = useState<number>(0);
  const [loadedPublishedAt, setLoadedPublishedAt] = useState<string | null>(null);
  const [workflowType, setWorkflowType] = useState('ticket-triage-workflow');
  const [automationConfigJson, setAutomationConfigJson] = useState(defaultAutomationConfigJson);
  const [baseline, setBaseline] = useState<EditorSnapshot | null>(null);
  const [localDialogOpen, setLocalDialogOpen] = useState(false);
  const absorbNextConfigRef = useRef(true);
  const loadingDefinitionRef = useRef(false);
  const pendingLocalAction = useRef<(() => void) | null>(null);
  const designerRef = useRef<UnifiedAutomationDesignerHandle | null>(null);
  const [designerEpoch, setDesignerEpoch] = useState(0);
  const [designerMounted, setDesignerMounted] = useState(true);

  const refreshDefinitions = useCallback(() => {
    setLoadingDefinitions(true);
    return admin.workflowDefinitions()
      .then((result) => {
        setDefinitions(result.workflow_definitions);
      })
      .finally(() => {
        setLoadingDefinitions(false);
      });
  }, []);

  useEffect(() => {
    admin.workflowDefinitions()
      .then((result) => {
        setDefinitions(result.workflow_definitions);
      })
      .finally(() => {
        setLoadingDefinitions(false);
      });
  }, []);

  const parsedAutomationConfig = useMemo(() => {
    try {
      const raw = JSON.parse(automationConfigJson || '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { value: {} as Record<string, unknown>, valid: false };
      return { value: raw as Record<string, unknown>, valid: true };
    } catch {
      return { value: {} as Record<string, unknown>, valid: false };
    }
  }, [automationConfigJson]);

  const serializedDraft = useMemo<PersistedUnifiedDefinition>(() => ({
    kind: 'unified_automation_designer_v1',
    workflowType,
    automationConfig: parsedAutomationConfig.value,
  }), [workflowType, parsedAutomationConfig.value]);

  const diffChanges = useMemo(() => {
    if (!loadedPublishedDefinition) return [];
    return diffObjects(loadedPublishedDefinition, serializedDraft as unknown as Record<string, unknown>);
  }, [loadedPublishedDefinition, serializedDraft]);

  const hasPublished = loadedPublishedDefinition !== null;

  const currentSnapshot = useMemo<EditorSnapshot>(() => ({
    definitionId,
    definitionName,
    workflowType,
    config: stableConfigJson(automationConfigJson),
  }), [automationConfigJson, definitionId, definitionName, workflowType]);

  const isDirty = Boolean(
    baseline && (
      baseline.definitionId !== currentSnapshot.definitionId ||
      baseline.definitionName !== currentSnapshot.definitionName ||
      baseline.workflowType !== currentSnapshot.workflowType ||
      baseline.config !== currentSnapshot.config
    ),
  );

  const saveDraft = useCallback(async (automationConfigOverride?: Record<string, unknown>): Promise<boolean> => {
    if (!definitionName.trim()) {
      setMessage(t('nameRequired'));
      return false;
    }
    if (!workflowType.trim()) {
      setMessage(t('workflowTypeRequired'));
      return false;
    }

    // Prefer an explicit config (SDK save) or a synchronous canvas flush — never trust stale parent JSON alone.
    const flushed = automationConfigOverride ?? designerRef.current?.flush() ?? null;
    if (!isPersistableAutomationConfig(flushed)) {
      setMessage(t('canvasNotReady'));
      return false;
    }
    const automationConfig = flushed;
    const configJson = JSON.stringify(automationConfig, null, 2);
    const draft: PersistedUnifiedDefinition = {
      kind: 'unified_automation_designer_v1',
      workflowType: workflowType.trim(),
      automationConfig,
    };

    setBusy(true);
    try {
      if (!definitionId) {
        const created = await admin.createWorkflowDefinition({
          name: definitionName.trim(),
          workflow_type: workflowType.trim(),
          draft_definition: draft as unknown as Record<string, unknown>,
        });
        setDefinitionId(created.id);
        setBaseline({
          definitionId: created.id,
          definitionName: definitionName.trim(),
          workflowType: workflowType.trim(),
          config: stableConfigJson(configJson),
        });
      } else {
        await admin.updateWorkflowDefinition(definitionId, {
          name: definitionName.trim(),
          workflow_type: workflowType.trim(),
          draft_definition: draft as unknown as Record<string, unknown>,
        });
        setBaseline({
          definitionId,
          definitionName: definitionName.trim(),
          workflowType: workflowType.trim(),
          config: stableConfigJson(configJson),
        });
      }
      await refreshDefinitions();
      setMessage(t('saved'));
      return true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t('saveFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  }, [
    definitionId,
    definitionName,
    refreshDefinitions,
    t,
    workflowType,
  ]);

  const saveRef = useLatestRef(saveDraft);

  const persistFromDesigner = useCallback(
    (cfg: Record<string, unknown>) => saveRef.current(cfg),
    [saveRef],
  );

  const {
    dialogOpen: unsavedDialogOpen,
    saving: unsavedDialogSaving,
    stayOnPage,
    leaveWithoutSaving,
    saveAndLeave,
  } = useUnsavedChangesGuard({
    isDirty,
    onSave: useCallback(() => saveRef.current(), [saveRef]),
  });

  const confirmIfDirty = useCallback((action: () => void) => {
    if (!isDirty) {
      action();
      return;
    }
    pendingLocalAction.current = action;
    setLocalDialogOpen(true);
  }, [isDirty]);

  const handleStay = useCallback(() => {
    pendingLocalAction.current = null;
    setLocalDialogOpen(false);
    stayOnPage();
  }, [stayOnPage]);

  const handleLeave = useCallback(() => {
    if (localDialogOpen) {
      const action = pendingLocalAction.current;
      pendingLocalAction.current = null;
      setLocalDialogOpen(false);
      action?.();
      return;
    }
    leaveWithoutSaving();
  }, [leaveWithoutSaving, localDialogOpen]);

  const handleSaveAndLeave = useCallback(async () => {
    if (localDialogOpen) {
      const saved = await saveRef.current();
      if (!saved) return;
      const action = pendingLocalAction.current;
      pendingLocalAction.current = null;
      setLocalDialogOpen(false);
      action?.();
      return;
    }
    await saveAndLeave?.();
  }, [localDialogOpen, saveAndLeave, saveRef]);

  const handleDesignerApply = useCallback((cfg: Record<string, unknown>) => {
    // Ignore canvas sync while a definition is loading — a pending SyncBridge can
    // otherwise overwrite the freshly loaded draft with the previous graph.
    if (loadingDefinitionRef.current) return;
    setAutomationConfigJson(JSON.stringify(cfg, null, 2));
    if (absorbNextConfigRef.current) {
      absorbNextConfigRef.current = false;
      setBaseline({
        definitionId,
        definitionName,
        workflowType,
        config: JSON.stringify(cfg),
      });
    }
  }, [definitionId, definitionName, workflowType]);

  const resetEditor = () => {
    absorbNextConfigRef.current = true;
    setDefinitionId(null);
    setDefinitionName(t('newDefinition'));
    setWorkflowType('ticket-triage-workflow');
    setAutomationConfigJson(defaultAutomationConfigJson());
    setLoadedPublishedDefinition(null);
    setLoadedVersion(0);
    setLoadedPublishedAt(null);
    setBaseline(null);
    setDesignerEpoch((n) => n + 1);
    setMessage(t('startedNewDraft'));
  };

  const loadDefinition = async (id: string) => {
    setBusy(true);
    loadingDefinitionRef.current = true;
    setDesignerMounted(false);
    try {
      const result = await admin.workflowDefinition(id);
      const def = result.workflow_definition;
      const normalized = normalizeLoadedDefinition(def.draft_definition, def.workflow_type);
      absorbNextConfigRef.current = true;
      setDefinitionId(def.id);
      setDefinitionName(def.name);
      setWorkflowType(normalized.workflowType);
      setAutomationConfigJson(normalized.automationConfigJson);
      setLoadedPublishedDefinition(def.published_definition);
      setLoadedVersion(def.version);
      setLoadedPublishedAt(def.published_at);
      setBaseline({
        definitionId: def.id,
        definitionName: def.name,
        workflowType: normalized.workflowType,
        config: stableConfigJson(normalized.automationConfigJson),
      });
      setDesignerEpoch((n) => n + 1);
      setDesignerMounted(true);
      setMessage(t('loaded', { name: def.name }));
    } finally {
      setBusy(false);
      // Allow applies only after the remount commit has been scheduled.
      queueMicrotask(() => {
        loadingDefinitionRef.current = false;
      });
    }
  };

  const publishDefinition = async () => {
    if (!definitionId) {
      setMessage(t('saveDraftFirst'));
      return;
    }

    const flushed = designerRef.current?.flush() ?? null;
    if (!isPersistableAutomationConfig(flushed)) {
      setMessage(t('canvasNotReady'));
      return;
    }
    const draft: PersistedUnifiedDefinition = {
      kind: 'unified_automation_designer_v1',
      workflowType: workflowType.trim(),
      automationConfig: flushed,
    };

    setBusy(true);
    try {
      await admin.publishWorkflowDefinition(definitionId, {
        draft_definition: draft as unknown as Record<string, unknown>,
      });
      setLoadedPublishedDefinition(draft as unknown as Record<string, unknown>);
      setLoadedVersion((v) => v + 1);
      setLoadedPublishedAt(new Date().toISOString());
      await refreshDefinitions();
      setMessage(t('published'));
    } finally {
      setBusy(false);
    }
  };

  const duplicateDefinition = async () => {
    if (!definitionId) {
      setMessage(t('duplicateFirst'));
      return;
    }
    setBusy(true);
    try {
      const result = await admin.duplicateWorkflowDefinition(definitionId);
      await refreshDefinitions();
      await loadDefinition(result.id);
      setMessage(t('duplicated'));
    } finally {
      setBusy(false);
    }
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(serializedDraft, null, 2));
    setMessage(t('copyJsonDone'));
  };

  return (
    <div className="flex flex-col gap-3 xl:flex-1 xl:min-h-0">
      <UnsavedChangesDialog
        open={unsavedDialogOpen || localDialogOpen}
        saving={unsavedDialogSaving || busy}
        onStay={handleStay}
        onLeave={handleLeave}
        onSaveAndLeave={handleSaveAndLeave}
      />
      <div className="shrink-0 [&>div]:mb-0">
        <PageHeader
          title={t('title')}
          description={t('description')}
          action={
            <div className="flex items-center gap-2">
              <button onClick={() => { void saveDraft(); }} disabled={busy} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
                {t('saveDraft')}
              </button>
              <button onClick={publishDefinition} disabled={busy || !definitionId || !parsedAutomationConfig.valid} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
                {t('publish')}
              </button>
            </div>
          }
        />
      </div>

      <WorkflowEditorToolbar
        definitionName={definitionName}
        onDefinitionName={setDefinitionName}
        definitionId={definitionId}
        definitions={definitions}
        loadingDefinitions={loadingDefinitions}
        busy={busy}
        onSelectDefinition={(id) => confirmIfDirty(() => { void loadDefinition(id); })}
        onNew={() => confirmIfDirty(resetEditor)}
        onDuplicate={() => confirmIfDirty(() => { void duplicateDefinition(); })}
        onCopyJson={() => { void copyJson(); }}
        workflowType={workflowType}
        onWorkflowType={setWorkflowType}
        message={message}
        hasPublished={hasPublished}
        loadedVersion={loadedVersion}
        loadedPublishedAt={loadedPublishedAt}
        diffChanges={diffChanges}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] gap-4 xl:flex-1 xl:min-h-0">
        <div className="min-h-[420px] xl:min-h-0 xl:h-full">
          {designerMounted ? (
            <UnifiedAutomationDesigner
              key={`designer-${definitionId ?? 'new'}-${designerEpoch}`}
              ref={designerRef}
              fillAvailableSpace
              initialConfigJson={automationConfigJson}
              onApply={handleDesignerApply}
              onPersist={persistFromDesigner}
            />
          ) : null}
        </div>
        <WorkflowEditorSidePanel
          automationConfigJson={automationConfigJson}
          onAutomationConfigJson={setAutomationConfigJson}
          configValid={parsedAutomationConfig.valid}
          config={parsedAutomationConfig.value}
          busy={busy}
        />
      </div>
    </div>
  );
}
