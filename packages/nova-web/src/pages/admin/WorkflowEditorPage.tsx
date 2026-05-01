/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import UnifiedAutomationDesigner from '../../components/workflow/UnifiedAutomationDesigner';
import { admin, type WorkflowDefinition } from '../../api/client';
import { diffObjects, formatDiffValue } from './workflow-editor/diff';

type PersistedUnifiedDefinition = {
  kind: 'unified_automation_designer_v1';
  workflowType: string;
  automationConfig: Record<string, unknown>;
};

function normalizeLoadedDefinition(
  draft: Record<string, unknown> | null | undefined,
  workflowTypeFallback: string,
): { workflowType: string; automationConfigJson: string } {
  const workflowType = typeof draft?.workflowType === 'string' && draft.workflowType.trim()
    ? draft.workflowType
    : workflowTypeFallback;
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    return { workflowType, automationConfigJson: '{\n  \n}' };
  }
  const kind = (draft as { kind?: unknown }).kind;
  const automationConfig = (draft as { automationConfig?: unknown }).automationConfig;
  if (kind === 'unified_automation_designer_v1' && automationConfig && typeof automationConfig === 'object' && !Array.isArray(automationConfig)) {
    return { workflowType, automationConfigJson: JSON.stringify(automationConfig, null, 2) };
  }
  return { workflowType, automationConfigJson: '{\n  \n}' };
}

export default function WorkflowEditorPage() {
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
  const [automationConfigJson, setAutomationConfigJson] = useState('{\n  \n}');

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

  const resetEditor = () => {
    setDefinitionId(null);
    setDefinitionName('New Workflow Definition');
    setWorkflowType('ticket-triage-workflow');
    setAutomationConfigJson('{\n  \n}');
    setLoadedPublishedDefinition(null);
    setLoadedVersion(0);
    setLoadedPublishedAt(null);
    setMessage('Started a new unified workflow draft');
  };

  const loadDefinition = async (id: string) => {
    setBusy(true);
    try {
      const result = await admin.workflowDefinition(id);
      const def = result.workflow_definition;
      const normalized = normalizeLoadedDefinition(def.draft_definition, def.workflow_type);
      setDefinitionId(def.id);
      setDefinitionName(def.name);
      setWorkflowType(normalized.workflowType);
      setAutomationConfigJson(normalized.automationConfigJson);
      setLoadedPublishedDefinition(def.published_definition);
      setLoadedVersion(def.version);
      setLoadedPublishedAt(def.published_at);
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
    if (!parsedAutomationConfig.valid) {
      setMessage('Automation config JSON is invalid');
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
    if (!parsedAutomationConfig.valid) {
      setMessage('Cannot publish: automation config JSON is invalid.');
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
      setMessage('Published new unified version');
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

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(serializedDraft, null, 2));
    setMessage('Unified workflow JSON copied');
  };

  return (
    <>
      <PageHeader
        title="Workflow Designer"
        description="Unified visual designer for reusable automation actions and workflow definitions."
        action={
          <div className="flex items-center gap-2">
            <button onClick={saveDraft} disabled={busy} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
              Save Draft
            </button>
            <button onClick={publishDefinition} disabled={busy || !definitionId || !parsedAutomationConfig.valid} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
              Publish
            </button>
          </div>
        }
      />

      <div className="mb-4 bg-white rounded-xl border border-gray-200 p-3">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-end">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Definition Name</label>
            <input value={definitionName} onChange={(e) => setDefinitionName(e.target.value)} className="w-full px-2.5 py-2 rounded border border-gray-200 text-sm" placeholder="Incident triage workflow" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Saved Definitions</label>
            <select value={definitionId ?? ''} disabled={loadingDefinitions || busy} onChange={(e) => { const id = e.target.value; if (id) void loadDefinition(id); }} className="w-full px-2.5 py-2 rounded border border-gray-200 text-sm bg-white">
              <option value="">Select...</option>
              {definitions.map((def) => <option key={def.id} value={def.id}>{def.name} ({def.workflow_type}) v{def.version}</option>)}
            </select>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={resetEditor} disabled={busy} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60">New</button>
            <button onClick={duplicateDefinition} disabled={busy || !definitionId} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60">Duplicate</button>
          </div>
          <div className="flex justify-end">
            <button onClick={copyJson} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Copy JSON</button>
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Workflow Type</label>
          <input value={workflowType} onChange={(e) => setWorkflowType(e.target.value)} className="w-full max-w-md px-2.5 py-2 rounded border border-gray-200 text-sm" />
        </div>
        {message && <p className="mt-2 text-xs text-gray-600">{message}</p>}
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
          <p className="text-xs font-semibold text-gray-700 mb-1">Draft vs Published</p>
          {!hasPublished ? (
            <p className="text-xs text-gray-600">No published version yet. Publish this draft to establish a baseline.</p>
          ) : (
            <>
              <p className="text-xs text-gray-600 mb-2">Published version: v{loadedVersion}{loadedPublishedAt ? ` at ${new Date(loadedPublishedAt).toLocaleString()}` : ''}</p>
              <p className="text-xs text-gray-700 mb-2">{diffChanges.length === 0 ? 'Draft matches published.' : `${diffChanges.length} field-level change(s) since publish.`}</p>
              {diffChanges.length > 0 && (
                <div className="max-h-40 overflow-auto bg-white border border-gray-200 rounded p-2">
                  <ul className="text-xs text-gray-700 space-y-2">
                    {diffChanges.slice(0, 40).map((change, idx) => (
                      <li key={`${change.path}-${idx}`}>
                        <p className="font-medium">- [{change.kind}] {change.path}</p>
                        <p className="text-[11px] text-gray-600">before: <span className="font-mono">{formatDiffValue(change.before)}</span></p>
                        <p className="text-[11px] text-gray-600">after: <span className="font-mono">{formatDiffValue(change.after)}</span></p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-4">
        <UnifiedAutomationDesigner
          initialConfigJson={automationConfigJson}
          onApply={(cfg) => setAutomationConfigJson(JSON.stringify(cfg, null, 2))}
        />
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-sm font-semibold text-gray-900 mb-2">Unified Workflow JSON</p>
          <textarea
            rows={26}
            value={automationConfigJson}
            onChange={(e) => setAutomationConfigJson(e.target.value)}
            className="w-full px-2.5 py-2 rounded border border-gray-200 text-sm font-mono"
          />
          {!parsedAutomationConfig.valid && (
            <p className="mt-2 text-xs text-red-700">JSON is invalid. Fix syntax to enable publish.</p>
          )}
        </div>
      </div>
    </>
  );
}
