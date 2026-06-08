/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { Link } from 'react-router-dom';
import { importer } from '../../api/client';
import type { ImportUploadResult, ImportRow, ImportValidationResult } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import ImportMappingStep from './ImportMappingStep';
import ImportReviewStep from './ImportReviewStep';

const ENTITY_KEYS = [
  'departments',
  'cost_centers',
  'users',
  'assignment_groups',
  'cmdb',
  'incidents',
] as const;

type WizardStep = 'upload' | 'mapping' | 'review' | 'result';

export default function ImportPage() {
  const t = useTranslations('pages.admin.import');

  const entityOptions = useMemo(
    () => ENTITY_KEYS.map((key) => ({ key, label: t(`entities.${key}` as Parameters<typeof t>[0]) })),
    [t],
  );

  const steps = useMemo(
    () => [
      t('steps.upload'),
      t('steps.mapping'),
      t('steps.review'),
      t('steps.done'),
    ],
    [t],
  );

  const [step, setStep] = useState<WizardStep>('upload');

  const [entityType, setEntityType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadResult, setUploadResult] = useState<ImportUploadResult | null>(null);

  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fixedValues, setFixedValues] = useState<Record<string, string>>({});
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [rowFilter, setRowFilter] = useState('all');
  const [rowPage, setRowPage] = useState(1);
  const [rowTotal, setRowTotal] = useState(0);
  const [loadingRows, setLoadingRows] = useState(false);
  const [committing, setCommitting] = useState(false);

  const [commitResult, setCommitResult] = useState<{ committed: number; failed: number } | null>(null);

  const handleUpload = async () => {
    if (!file || !entityType) return;
    setUploading(true);
    setUploadError('');
    try {
      const result = await importer.upload(file, entityType);
      setUploadResult(result);
      setMapping(result.suggested_mapping);
      setFixedValues({});
      setStep('mapping');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handleValidate = async () => {
    if (!uploadResult) return;
    setValidating(true);
    try {
      const result = await importer.validate(uploadResult.id, mapping, fixedValues);
      setValidationResult(result);
      setStep('review');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('validationFailed'));
    } finally {
      setValidating(false);
    }
  };

  const loadRows = useCallback(async () => {
    if (!uploadResult) return;
    setLoadingRows(true);
    try {
      const res = await importer.getRows(uploadResult.id, {
        page: String(rowPage),
        limit: '50',
        ...(rowFilter !== 'all' ? { status: rowFilter } : {}),
      });
      setRows(res.rows);
      setRowTotal(res.pagination.total);
    } finally {
      setLoadingRows(false);
    }
  }, [uploadResult, rowPage, rowFilter]);

  useEffect(() => {
    if (step === 'review') loadRows();
  }, [step, loadRows]);

  const handleCommit = async () => {
    if (!uploadResult) return;
    setCommitting(true);
    try {
      const result = await importer.commit(uploadResult.id);
      setCommitResult(result);
      setStep('result');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('commitFailed'));
    } finally {
      setCommitting(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
    setEntityType('');
    setFile(null);
    setUploadResult(null);
    setMapping({});
    setFixedValues({});
    setValidationResult(null);
    setRows([]);
    setCommitResult(null);
    setUploadError('');
    setRowFilter('all');
    setRowPage(1);
  };

  const stepIndex = { upload: 0, mapping: 1, review: 2, result: 3 };

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          <Link
            to="/admin/import/history"
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('importHistory')}
          </Link>
        }
      />

      <div className="flex items-center gap-2 mb-6">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                i <= stepIndex[step]
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {i + 1}
            </div>
            <span className={`text-sm ${i <= stepIndex[step] ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
              {s}
            </span>
            {i < steps.length - 1 && <div className="w-8 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      {uploadError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{uploadError}</div>
      )}

      {step === 'upload' && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">{t('uploadSection')}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('entityType')}</label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">{t('selectPlaceholder')}</option>
                {entityOptions.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('file')}</label>
              <div
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-indigo-300 transition-colors cursor-pointer"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) setFile(f);
                }}
                onClick={() => document.getElementById('file-input')?.click()}
              >
                <input
                  id="file-input"
                  type="file"
                  accept=".csv,.xlsx,.xls,.json"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                {file ? (
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-500">{t('dragDrop')}</p>
                    <p className="text-xs text-gray-400 mt-1">{t('supportedFormats')}</p>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleUpload}
              disabled={!file || !entityType || uploading}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? t('uploading') : t('uploadAndParse')}
            </button>
          </div>
        </Card>
      )}

      {step === 'mapping' && uploadResult && (
        <ImportMappingStep
          uploadResult={uploadResult}
          mapping={mapping}
          setMapping={setMapping}
          fixedValues={fixedValues}
          setFixedValues={setFixedValues}
          validating={validating}
          onBack={() => setStep('upload')}
          onValidate={handleValidate}
        />
      )}

      {step === 'review' && validationResult && uploadResult && (
        <ImportReviewStep
          validationResult={validationResult}
          rows={rows}
          rowFilter={rowFilter}
          setRowFilter={setRowFilter}
          rowPage={rowPage}
          setRowPage={setRowPage}
          rowTotal={rowTotal}
          loadingRows={loadingRows}
          committing={committing}
          onBackToMapping={() => setStep('mapping')}
          onCommit={handleCommit}
        />
      )}

      {step === 'result' && commitResult && (
        <Card>
          <div className="text-center py-8">
            <div className="text-5xl mb-4">{commitResult.failed === 0 ? '✓' : '!'}</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{t('importComplete')}</h3>
            <p className="text-gray-600 mb-6">
              <span className="font-medium text-green-700">{t('rowsImported', { count: commitResult.committed })}</span>
              {commitResult.failed > 0 && (
                <span className="font-medium text-red-600 ml-2">{t('rowsFailed', { count: commitResult.failed })}</span>
              )}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleReset}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                {t('startAnotherImport')}
              </button>
              <Link
                to="/admin/import/history"
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                {t('viewHistory')}
              </Link>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
