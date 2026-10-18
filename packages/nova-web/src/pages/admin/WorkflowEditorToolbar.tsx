/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import { validateAutomationConfig } from '@nova-suite/shared';
import type { WorkflowDefinition } from '../../api/client';
import AutomationDryRunPanel from '../../components/workflow/AutomationDryRunPanel';
import { formatDateTime } from '../../utils/dateTime';
import { formatDiffValue, type DiffChange } from './workflow-editor/diff';

export function WorkflowEditorToolbar({
  definitionName,
  onDefinitionName,
  definitionId,
  definitions,
  loadingDefinitions,
  busy,
  onSelectDefinition,
  onNew,
  onDuplicate,
  onCopyJson,
  workflowType,
  onWorkflowType,
  message,
  hasPublished,
  loadedVersion,
  loadedPublishedAt,
  diffChanges,
}: {
  definitionName: string;
  onDefinitionName: (value: string) => void;
  definitionId: string | null;
  definitions: WorkflowDefinition[];
  loadingDefinitions: boolean;
  busy: boolean;
  onSelectDefinition: (id: string) => void;
  onNew: () => void;
  onDuplicate: () => void;
  onCopyJson: () => void;
  workflowType: string;
  onWorkflowType: (value: string) => void;
  message: string | null;
  hasPublished: boolean;
  loadedVersion: number;
  loadedPublishedAt: string | null;
  diffChanges: DiffChange[];
}) {
  const t = useTranslations('pages.admin.workflows.editor');

  return (
    <div className="shrink-0 max-h-[34vh] overflow-y-auto bg-white rounded-xl border border-gray-200 p-3">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-end">
        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('definitionName')}</label>
          <input value={definitionName} onChange={(e) => onDefinitionName(e.target.value)} className="w-full px-2.5 py-2 rounded-sm border border-gray-200 text-sm" placeholder={t('definitionPlaceholder')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{t('definitions')}</label>
          <select value={definitionId ?? ''} disabled={loadingDefinitions || busy} onChange={(e) => { const id = e.target.value; if (id) onSelectDefinition(id); }} className="w-full px-2.5 py-2 rounded-sm border border-gray-200 text-sm bg-white">
            <option value="">{t('select')}</option>
            {definitions.map((def) => <option key={def.id} value={def.id}>{def.name} ({def.workflow_type}) v{def.version}</option>)}
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={onNew} disabled={busy} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60">{t('new')}</button>
          <button onClick={onDuplicate} disabled={busy || !definitionId} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60">{t('duplicate')}</button>
        </div>
        <div className="flex justify-end">
          <button onClick={onCopyJson} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">{t('copyJson')}</button>
        </div>
      </div>
      <div className="mt-3">
        <label className="block text-xs font-medium text-gray-600 mb-1">{t('workflowType')}</label>
        <input value={workflowType} onChange={(e) => onWorkflowType(e.target.value)} className="w-full max-w-md px-2.5 py-2 rounded-sm border border-gray-200 text-sm" />
      </div>
      {message && <p className="mt-2 text-xs text-gray-600">{message}</p>}
      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
        <p className="text-xs font-semibold text-gray-700 mb-1">{t('diffTitle')}</p>
        {!hasPublished ? (
          <p className="text-xs text-gray-600">{t('notPublished')}</p>
        ) : (
          <>
            <p className="text-xs text-gray-600 mb-2">{t('publishedVersion', { version: loadedVersion, date: loadedPublishedAt ? formatDateTime(loadedPublishedAt) : '' })}</p>
            <p className="text-xs text-gray-700 mb-2">{diffChanges.length === 0 ? t('draftMatches') : t('fieldChanges', { count: diffChanges.length })}</p>
            {diffChanges.length > 0 && (
              <div className="max-h-28 overflow-auto bg-white border border-gray-200 rounded-sm p-2">
                <ul className="text-xs text-gray-700 space-y-2">
                  {diffChanges.slice(0, 40).map((change, idx) => (
                    <li key={`${change.path}-${idx}`}>
                      <p className="font-medium">- [{change.kind}] {change.path}</p>
                      <p className="text-[11px] text-gray-600">{t('before')} <span className="font-mono">{formatDiffValue(change.before)}</span></p>
                      <p className="text-[11px] text-gray-600">{t('after')} <span className="font-mono">{formatDiffValue(change.after)}</span></p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function WorkflowEditorSidePanel({
  automationConfigJson,
  onAutomationConfigJson,
  configValid,
  config,
  busy,
}: {
  automationConfigJson: string;
  onAutomationConfigJson: (value: string) => void;
  configValid: boolean;
  config: Record<string, unknown>;
  busy: boolean;
}) {
  const t = useTranslations('pages.admin.workflows.editor');

  return (
    <div className="min-h-0 flex flex-col gap-3 xl:overflow-hidden">
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-col min-h-[180px] xl:flex-1 xl:min-h-[180px]">
        <p className="text-sm font-semibold text-gray-900 mb-2 shrink-0">{t('unifiedJson')}</p>
        <textarea
          value={automationConfigJson}
          onChange={(e) => onAutomationConfigJson(e.target.value)}
          className="w-full flex-1 min-h-[120px] px-2.5 py-2 rounded-sm border border-gray-200 text-sm font-mono resize-y xl:resize-none"
        />
        {!configValid && (
          <p className="mt-2 text-xs text-red-700 shrink-0">{t('jsonInvalid')}</p>
        )}
      </div>
      <div className="min-h-0 xl:max-h-[48%] xl:overflow-y-auto">
        <AutomationDryRunPanel
          disabled={busy || !configValid}
          getConfig={() => {
            if (!configValid) return { config: null, error: t('invalidJson') };
            const errors = validateAutomationConfig(config);
            if (errors.length > 0) return { config: null, error: errors.join('; ') };
            return { config };
          }}
        />
      </div>
    </div>
  );
}
