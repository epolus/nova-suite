/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
import type { DataSourceTestResult, EntityFieldDef, TenantCredentialListItem } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import type { FormData } from './dataSourceForm';
import DataSourceBasicFields from './DataSourceBasicFields';
import DataSourceAuthFields from './DataSourceAuthFields';

interface DataSourceFormViewProps {
  form: FormData;
  setField: (key: keyof FormData, value: string | boolean) => void;
  entities: EntityFieldDef[];
  vaultCreds: TenantCredentialListItem[];
  editId: string | null;
  saving: boolean;
  testingSource: boolean;
  testError: string;
  testResult: DataSourceTestResult | null;
  onSave: () => void;
  onTest: () => void;
  onCancel: () => void;
  onApplySuggestedMapping: () => void;
  onApplyDetectedColumnsTemplate: () => void;
}

export default function DataSourceFormView({
  form,
  setField,
  entities,
  vaultCreds,
  editId,
  saving,
  testingSource,
  testError,
  testResult,
  onSave,
  onTest,
  onCancel,
  onApplySuggestedMapping,
  onApplyDetectedColumnsTemplate,
}: DataSourceFormViewProps) {
  const t = useTranslations('pages.admin.dataSources');
  const tActions = useTranslations('common.actions');

  const CRON_PRESETS = useMemo(() => [
    { value: '0 2 * * *', label: t('cronPresets.daily2am') },
    { value: '0 */6 * * *', label: t('cronPresets.every6h') },
    { value: '0 */12 * * *', label: t('cronPresets.every12h') },
    { value: '0 0 * * 1', label: t('cronPresets.weeklyMonday') },
    { value: '*/30 * * * *', label: t('cronPresets.every30m') },
  ], [t]);

  const entityFields = entities.find((e) => e.key === form.entity_type)?.fields || [];

  return (
    <>
      <PageHeader
        title={editId ? t('editTitle') : t('newTitle')}
        description={editId ? t('edit') : t('new')}
        action={
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            {tActions('cancel')}
          </button>
        }
      />

      <div className="max-w-3xl space-y-6">
        <DataSourceBasicFields form={form} setField={setField} entities={entities} />
        <DataSourceAuthFields form={form} setField={setField} vaultCreds={vaultCreds} />

        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">{t('columnMapping')}</h3>
          <p className="text-xs text-gray-500 mb-3">
            {t('columnMappingHelp')}
            <span className="block mt-1">
              {t('columnMappingOneToMany')}
            </span>
            {entityFields.length > 0 && (
              <span className="block mt-1">
                {t('availableFields')} {entityFields.map((f) => (
                  <span key={f.key} className={`inline-block mr-1 ${f.required ? 'font-semibold' : ''}`}>
                    {f.key}{f.required ? '*' : ''}
                  </span>
                ))}
              </span>
            )}
          </p>
          <textarea
            value={form.column_mapping}
            onChange={(e) => setField('column_mapping', e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            placeholder='{"email": "email", "full_name": "display_name"}'
          />
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">{t('scheduleSection')}</h3>
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.schedule_enabled}
                onChange={(e) => setField('schedule_enabled', e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-gray-700">{t('enableSchedule')}</span>
            </label>
            {form.schedule_enabled && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('cronSchedule')}</label>
                  <div className="flex gap-2">
                    <select
                      value={CRON_PRESETS.find((p) => p.value === form.schedule_cron) ? form.schedule_cron : '__custom'}
                      onChange={(e) => {
                        if (e.target.value !== '__custom') setField('schedule_cron', e.target.value);
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    >
                      {CRON_PRESETS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                      <option value="__custom">{t('cronCustom')}</option>
                    </select>
                    <input
                      type="text"
                      value={form.schedule_cron}
                      onChange={(e) => setField('schedule_cron', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="0 2 * * *"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  {t('cronHelp')}
                </p>
              </>
            )}
          </div>
        </Card>

        <div className="flex gap-3">
          <button
            onClick={onTest}
            disabled={
              testingSource
              || !form.entity_type
              || (form.source_type === 'sftp'
                ? (!form.sftp_host || !form.sftp_path)
                : !form.url)
            }
            className="px-6 py-2.5 border border-indigo-300 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-50 disabled:opacity-50 transition-colors"
          >
            {testingSource ? t('testing') : t('testSource')}
          </button>
          <button
            onClick={onSave}
            disabled={saving || !form.name || !form.entity_type || (form.source_type === 'sftp' ? (!form.sftp_host || !form.sftp_path) : !form.url)}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? tActions('saving') : (editId ? t('updateButton') : t('createDataSource'))}
          </button>
          <button
            onClick={onCancel}
            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            {tActions('cancel')}
          </button>
        </div>

        {(testError || testResult) && (
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">{t('testResult')}</h3>
            {testError && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{testError}</p>
            )}
            {testResult && (
              <div className="space-y-3 text-sm">
                <p className="text-gray-600">{t('detectedFromSource', { type: testResult.content_type || t('unknownType') })}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{t('copyMappingTemplate')}</span>
                  <button
                    onClick={onApplyDetectedColumnsTemplate}
                    disabled={testResult.detected_columns.length === 0}
                    className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    {t('useDetectedTemplate')}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {testResult.detected_columns.length > 0 ? testResult.detected_columns.map((col) => (
                    <span key={col} className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 font-mono text-xs">
                      {col}
                    </span>
                  )) : <span className="text-gray-400">{t('noColumnsDetected')}</span>}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-gray-600">{t('suggestedMapping')}</p>
                    <button
                      onClick={onApplySuggestedMapping}
                      disabled={Object.keys(testResult.suggested_mapping).length === 0}
                      className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                      {t('applySuggestion')}
                    </button>
                  </div>
                  <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2 overflow-auto max-h-44">
                    {JSON.stringify(testResult.suggested_mapping, null, 2)}
                  </pre>
                </div>

                <div>
                  <p className="text-gray-600 mb-1">{t('sampleRows')}</p>
                  <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2 overflow-auto max-h-56">
                    {JSON.stringify(testResult.sample_rows, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
