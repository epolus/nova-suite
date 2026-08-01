/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Ref } from 'react';
import { useTranslations } from 'use-intl';
import type { TenantCredentialListItem } from '../../../api/client';
import UnifiedAutomationDesigner from '../../../components/workflow/UnifiedAutomationDesigner';
import {
  AUTOMATION_SNIPPET_IDS,
  AUTOMATION_SNIPPET_JSON,
  isEmptyAutomationJson,
  TEMPLATE_TOKEN_KEYS,
  TEMPLATE_TOKENS,
} from './automationSnippets';

export default function AutomationConfigField({
  value,
  onChange,
  textareaRef,
  onInsertAtCursor,
  onReplaceJson,
  showVisualBuilder,
  onToggleVisualBuilder,
  onApplyVisualBuilder,
  vaultCreds,
}: {
  value: string;
  onChange: (json: string) => void;
  textareaRef: Ref<HTMLTextAreaElement>;
  onInsertAtCursor: (snippet: string) => void;
  onReplaceJson: (json: string) => void;
  showVisualBuilder: boolean;
  onToggleVisualBuilder: () => void;
  onApplyVisualBuilder: (cfg: Record<string, unknown>) => void;
  vaultCreds: TenantCredentialListItem[];
}) {
  const t = useTranslations('pages.admin.catalogTasks.detail');

  return (
    <div className="md:col-span-2">
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {t('automationJson')}
      </label>
      <p className="text-xs text-gray-500 mb-2">{t('automationHelp')}</p>
      <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-1.5 mb-2">
        {t('automationHandoff')}
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-600">{t('insertExample')}</span>
        {AUTOMATION_SNIPPET_IDS.map((snippetId) => (
          <button
            key={snippetId}
            type="button"
            onClick={() => {
              const label = t(`snippets.${snippetId}`);
              if (!isEmptyAutomationJson(value)) {
                const ok = window.confirm(t('confirmReplace', { label }));
                if (!ok) return;
              }
              onReplaceJson(AUTOMATION_SNIPPET_JSON[snippetId]);
            }}
            className="px-2 py-1 text-xs font-medium rounded-md border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
          >
            {t(`snippets.${snippetId}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-600">{t('insertAtCursor')}</span>
        <button
          type="button"
          onClick={onToggleVisualBuilder}
          className="px-2 py-1 text-xs rounded-md border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
        >
          {showVisualBuilder ? t('hideVisualBuilder') : t('showVisualBuilder')}
        </button>
        {vaultCreds.length > 0 && (
          <select
            className="text-xs border border-gray-200 rounded px-2 py-1 max-w-[220px] bg-white"
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) onInsertAtCursor(`{{cred.${v}}}`);
              e.target.value = '';
            }}
            title={t('insertVaultTitle')}
          >
            <option value="">{t('vaultCredential')}</option>
            {vaultCreds.map((c) => (
              <option key={c.id} value={c.slug}>{c.label} ({c.slug})</option>
            ))}
          </select>
        )}
        {TEMPLATE_TOKEN_KEYS.map((tokenKey) => (
          <button
            key={tokenKey}
            type="button"
            onClick={() => onInsertAtCursor(TEMPLATE_TOKENS[tokenKey])}
            className="px-2 py-1 text-xs rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          >
            {t(`tokens.${tokenKey}`)}
          </button>
        ))}
      </div>
      {showVisualBuilder && (
        <div className="mb-3">
          <UnifiedAutomationDesigner
            initialConfigJson={value}
            onApply={onApplyVisualBuilder}
          />
        </div>
      )}
      <textarea
        ref={textareaRef}
        rows={14}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
      />
    </div>
  );
}
