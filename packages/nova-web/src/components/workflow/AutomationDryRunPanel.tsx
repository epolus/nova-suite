/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { admin } from '../../api/client';
import type { AutomationDryRunResult } from '../../api/types/automationDryRun';

export default function AutomationDryRunPanel({
  getConfig,
  disabled,
}: {
  getConfig: () => { config: Record<string, unknown> | null; error?: string };
  disabled?: boolean;
}) {
  const t = useTranslations('components.automationDryRun');
  const [formDataJson, setFormDataJson] = useState('{\n  \n}');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AutomationDryRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    setResult(null);
    const loaded = getConfig();
    if (!loaded.config) {
      setError(loaded.error || t('invalidConfig'));
      return;
    }
    let form_data: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(formDataJson || '{}') as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setError(t('formDataMustBeObject'));
        return;
      }
      form_data = parsed as Record<string, unknown>;
    } catch {
      setError(t('formDataInvalidJson'));
      return;
    }

    setRunning(true);
    try {
      const out = await admin.dryRunAutomation({
        automation_config: loaded.config,
        request_context: { form_data },
      });
      setResult(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('runFailed'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">{t('title')}</p>
          <p className="text-xs text-gray-500">{t('description')}</p>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={disabled || running}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          <span aria-hidden>▶</span>
          {running ? t('running') : t('play')}
        </button>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">{t('formDataLabel')}</label>
        <textarea
          rows={5}
          value={formDataJson}
          onChange={(e) => setFormDataJson(e.target.value)}
          spellCheck={false}
          className="w-full px-2.5 py-2 rounded-sm border border-gray-200 text-xs font-mono"
        />
      </div>

      {error && (
        <div className="p-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {result && (
        <div
          className={`p-2.5 rounded-md border text-xs space-y-2 ${
            result.ok
              ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800'
              : 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800'
          }`}
        >
          <p className="font-semibold text-gray-900 dark:text-gray-100">
            {result.ok ? t('resultOk') : t('resultFailed')}: {result.message}
          </p>
          {result.warnings.length > 0 && (
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">{t('warnings')}</p>
              <ul className="list-disc pl-4 text-gray-700 dark:text-gray-300 space-y-0.5">
                {result.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}
          <div>
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">{t('trace')}</p>
            <ol className="list-decimal pl-4 font-mono text-[11px] text-gray-800 dark:text-gray-200 space-y-0.5">
              {result.trace.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
          {Object.keys(result.mergePatch).length > 0 && (
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">{t('mergePatch')}</p>
              <pre className="overflow-auto max-h-40 bg-gray-50 border border-gray-200 rounded-sm p-2 font-mono text-[11px] text-gray-800 dark:bg-black/30 dark:border-gray-600 dark:text-gray-200">
                {JSON.stringify(result.mergePatch, null, 2)}
              </pre>
            </div>
          )}
          <div>
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">{t('stateResults')}</p>
            <pre className="overflow-auto max-h-48 bg-gray-50 border border-gray-200 rounded-sm p-2 font-mono text-[11px] text-gray-800 dark:bg-black/30 dark:border-gray-600 dark:text-gray-200">
              {JSON.stringify(result.stateResults, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
