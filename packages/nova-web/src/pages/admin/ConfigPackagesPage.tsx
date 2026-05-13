/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
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
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <SummaryPill label="Create" value={report.summary.create} />
        <SummaryPill label="Update" value={report.summary.update} />
        <SummaryPill label="Skip" value={report.summary.skip} />
        <SummaryPill label="Errors" value={report.summary.errors} />
        <SummaryPill label="Warnings" value={report.summary.warnings} />
      </div>

      {report.issues.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Issues</h3>
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
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Planned Changes</h3>
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Action</th>
                  <th className="text-left px-3 py-2 font-medium">Type</th>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">External Key</th>
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
            <p className="text-xs text-gray-500 mt-2">Showing first 100 changes.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ConfigPackagesPage() {
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
      setMessage(`Exported ${result.package.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
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
      setMessage(`Loaded ${parsed.name || file.name}. Run validation before applying.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse JSON package');
    }
  };

  const handleValidate = async () => {
    if (!bundle) return;
    setError('');
    setMessage('');
    try {
      const result = await admin.validateConfigPackage(bundle);
      setValidation(result.validation);
      setMessage(result.validation.valid ? 'Package is valid for this instance.' : 'Package has blocking validation errors.');
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
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
      setMessage(
        `Applied package: ${result.applied.categories} categories, ${result.applied.service_items} service items, ${result.applied.catalog_tasks} tasks, ${result.applied.notification_rules} notification rules.`,
      );
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setApplying(false);
    }
  };

  const needsObjectId = exportMode === 'catalog_item' || exportMode === 'notification_rule';

  return (
    <>
      <PageHeader
        title="Configuration Packages"
        description="Export, validate, and apply portable catalog and notification configuration between Nova instances."
      />

      {message && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{message}</div>
      )}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <h2 className="font-semibold text-gray-900 mb-2">Export from this instance</h2>
          <p className="text-sm text-gray-500 mb-4">
            Download a versioned JSON package that can be validated and applied on another instance.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Export scope</label>
              <select
                value={exportMode}
                onChange={(event) => setExportMode(event.target.value as ExportMode)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="catalog">All service catalog configuration</option>
                <option value="catalog_item">One service catalog item</option>
                <option value="notifications">All notification rules</option>
                <option value="notification_rule">One notification rule</option>
              </select>
            </div>
            {needsObjectId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Object UUID</label>
                <input
                  value={objectId}
                  onChange={(event) => setObjectId(event.target.value)}
                  placeholder="Paste the service item or notification rule UUID"
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
              {exporting ? 'Exporting...' : 'Export Package'}
            </button>
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-gray-900 mb-2">Import into this instance</h2>
          <p className="text-sm text-gray-500 mb-4">
            Upload a package from another instance, dry-run it, then apply the idempotent changes.
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
            <p className="text-sm text-gray-500">Drag & drop a JSON package here, or click to browse.</p>
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
              Validate
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!bundle || applying || (validation != null && !validation.valid)}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {applying ? 'Applying...' : 'Apply Package'}
            </button>
          </div>
        </Card>
      </div>

      {validation && (
        <Card className="mt-6">
          <h2 className="font-semibold text-gray-900 mb-4">Validation Result</h2>
          <ValidationSummary report={validation} />
        </Card>
      )}

      <Card className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Deployment History</h2>
          <button
            type="button"
            onClick={() => void loadRuns()}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
        {loadingRuns ? (
          <Spinner />
        ) : runs.length === 0 ? (
          <p className="text-sm text-gray-500">No configuration deployment runs yet.</p>
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Created</th>
                  <th className="text-left px-3 py-2 font-medium">Package</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Mode</th>
                  <th className="text-left px-3 py-2 font-medium">Actor</th>
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
                    <td className="px-3 py-2">{run.dry_run ? 'Dry run' : 'Apply'}</td>
                    <td className="px-3 py-2">{run.actor_name || 'Unknown'}</td>
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
