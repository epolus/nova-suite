/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { admin } from '../../api/client';
import { formatDateTime } from '../../utils/dateTime';
import type {
  ConfigDeploymentRun,
  ConfigPackageBundle,
  ConfigPackageValidationReport,
} from '../../api/client';

type ExportMode = 'catalog' | 'catalog_item' | 'notifications' | 'notification_rule';

function downloadBundle(bundle: ConfigPackageBundle, checksum: string) {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = bundle.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'nova-config-package';
  a.href = url;
  a.download = `${safeName}-${checksum.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-700">
      {label}: <span className="font-semibold">{value}</span>
    </span>
  );
}

function ValidationSummary({ report }: { report: ConfigPackageValidationReport }) {
  const t = useTranslations('pages.admin.configPackages');
  const tTable = useTranslations('common.table');
  const tFields = useTranslations('common.fields');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <SummaryPill label={t('summary.create')} value={report.summary.create} />
        <SummaryPill label={t('summary.update')} value={report.summary.update} />
        <SummaryPill label={t('summary.skip')} value={report.summary.skip} />
        <SummaryPill label={t('summary.errors')} value={report.summary.errors} />
        <SummaryPill label={t('summary.warnings')} value={report.summary.warnings} />
      </div>

      {report.issues.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('issues')}</h3>
          <div className="space-y-2">
            {report.issues.map((issue, idx) => (
              <div
                key={`${issue.path}-${idx}`}
                className={`px-3 py-2 rounded-lg border text-sm ${
                  issue.severity === 'error'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'
                }`}
              >
                <span className="font-semibold uppercase text-xs">{issue.severity}</span>
                <span className="ml-2 font-mono text-xs">{issue.path}</span>
                <p className="mt-1">{issue.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.changes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('plannedChanges')}</h3>
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">{tTable('actions')}</th>
                  <th className="text-left px-3 py-2 font-medium">{tFields('type')}</th>
                  <th className="text-left px-3 py-2 font-medium">{tFields('name')}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('table.externalKey')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.changes.slice(0, 100).map((change) => (
                  <tr key={`${change.type}-${change.external_key}`}>
                    <td className="px-3 py-2 capitalize">{change.action}</td>
                    <td className="px-3 py-2">{change.type.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2">{change.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{change.external_key}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.changes.length > 100 && (
            <p className="text-xs text-gray-500 mt-2">{t('showingFirst100')}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ConfigPackagesPage() {
  const t = useTranslations('pages.admin.configPackages');
  const tActions = useTranslations('common.actions');
  const tFields = useTranslations('common.fields');

  const [exportMode, setExportMode] = useState<ExportMode>('catalog');
  const [objectId, setObjectId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [bundle, setBundle] = useState<ConfigPackageBundle | null>(null);
  const [validation, setValidation] = useState<ConfigPackageValidationReport | null>(null);
  const [runs, setRuns] = useState<ConfigDeploymentRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadRuns = async () => {
    setLoadingRuns(true);
    try {
      const result = await admin.configPackageRuns();
      setRuns(result.runs);
    } finally {
      setLoadingRuns(false);
    }
  };

  useEffect(() => {
    void loadRuns();
  }, []);

  const handleExport = async () => {
    setExporting(true);
    setError('');
    setMessage('');
    try {
      let result;
      if (exportMode === 'catalog') result = await admin.exportCatalogPackage();
      else if (exportMode === 'notifications') result = await admin.exportNotificationPackage();
      else if (exportMode === 'catalog_item') result = await admin.exportCatalogItemPackage(objectId.trim());
      else result = await admin.exportNotificationRulePackage(objectId.trim());
      downloadBundle(result.package, result.checksum);
      setMessage(t('exported', { name: result.package.name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setMessage('');
    setValidation(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ConfigPackageBundle;
      setBundle(parsed);
      setMessage(t('loaded', { name: parsed.name || file.name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('parseFailed'));
    }
  };

  const handleValidate = async () => {
    if (!bundle) return;
    setError('');
    setMessage('');
    try {
      const result = await admin.validateConfigPackage(bundle);
      setValidation(result.validation);
      setMessage(result.validation.valid ? t('valid') : t('hasErrors'));
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('validationFailed'));
    }
  };

  const handleApply = async () => {
    if (!bundle) return;
    setApplying(true);
    setError('');
    setMessage('');
    try {
      const result = await admin.applyConfigPackage(bundle);
      setValidation(result.dry_run);
      setMessage(t('applied', {
        categories: result.applied.categories,
        serviceItems: result.applied.service_items,
        catalogTasks: result.applied.catalog_tasks,
        notificationRules: result.applied.notification_rules,
      }));
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('applyFailed'));
    } finally {
      setApplying(false);
    }
  };

  const needsObjectId = exportMode === 'catalog_item' || exportMode === 'notification_rule';

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
      />

      {message && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{message}</div>
      )}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <h2 className="font-semibold text-gray-900 mb-2">{t('exportSection')}</h2>
          <p className="text-sm text-gray-500 mb-4">
            {t('exportDescription')}
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('exportScope')}</label>
              <select
                value={exportMode}
                onChange={(event) => setExportMode(event.target.value as ExportMode)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="catalog">{t('exportModes.catalog')}</option>
                <option value="catalog_item">{t('exportModes.catalog_item')}</option>
                <option value="notifications">{t('exportModes.notifications')}</option>
                <option value="notification_rule">{t('exportModes.notification_rule')}</option>
              </select>
            </div>
            {needsObjectId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('objectUuid')}</label>
                <input
                  value={objectId}
                  onChange={(event) => setObjectId(event.target.value)}
                  placeholder={t('objectUuidPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
            )}
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || (needsObjectId && !objectId.trim())}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {exporting ? t('exporting') : t('exportButton')}
            </button>
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-gray-900 mb-2">{t('importSection')}</h2>
          <p className="text-sm text-gray-500 mb-4">
            {t('importDescription')}
          </p>
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-indigo-300 transition-colors cursor-pointer"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void handleFile(event.dataTransfer.files[0]);
            }}
            onClick={() => document.getElementById('config-package-input')?.click()}
          >
            <input
              id="config-package-input"
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <p className="text-sm text-gray-500">{t('dropzone')}</p>
            {bundle && (
              <p className="text-sm font-medium text-gray-900 mt-2">{bundle.name}</p>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={handleValidate}
              disabled={!bundle}
              className="px-5 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {t('validate')}
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!bundle || applying || (validation != null && !validation.valid)}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {applying ? t('applying') : t('applyButton')}
            </button>
          </div>
        </Card>
      </div>

      {validation && (
        <Card className="mt-6">
          <h2 className="font-semibold text-gray-900 mb-4">{t('validationResult')}</h2>
          <ValidationSummary report={validation} />
        </Card>
      )}

      <Card className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{t('deploymentHistory')}</h2>
          <button
            type="button"
            onClick={() => void loadRuns()}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {tActions('refresh')}
          </button>
        </div>
        {loadingRuns ? (
          <Spinner />
        ) : runs.length === 0 ? (
          <p className="text-sm text-gray-500">{t('noRuns')}</p>
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">{t('table.created')}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('table.package')}</th>
                  <th className="text-left px-3 py-2 font-medium">{tFields('status')}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('table.mode')}</th>
                  <th className="text-left px-3 py-2 font-medium">{t('table.actor')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="px-3 py-2">{formatDateTime(run.created_at)}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900">{run.package_name}</p>
                      <p className="font-mono text-xs text-gray-500">{run.package_checksum.slice(0, 16)}</p>
                    </td>
                    <td className="px-3 py-2 capitalize">{run.status}</td>
                    <td className="px-3 py-2">{run.dry_run ? t('modeDryRun') : t('modeApply')}</td>
                    <td className="px-3 py-2">{run.actor_name || t('unknownActor')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
