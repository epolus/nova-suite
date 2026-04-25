/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { importer } from '../../api/client';
import type { ImportUploadResult, ImportRow, ImportValidationResult } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';

const ENTITY_OPTIONS = [
  { key: 'departments', label: 'Departments' },
  { key: 'cost_centers', label: 'Cost Centers' },
  { key: 'users', label: 'Users' },
  { key: 'assignment_groups', label: 'Assignment Groups' },
  { key: 'cmdb', label: 'CMDB / Configuration Items' },
  { key: 'incidents', label: 'Incidents' },
];

type WizardStep = 'upload' | 'mapping' | 'review' | 'result';

export default function ImportPage() {
  const [step, setStep] = useState<WizardStep>('upload');

  // Upload state
  const [entityType, setEntityType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadResult, setUploadResult] = useState<ImportUploadResult | null>(null);

  // Mapping state
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fixedValues, setFixedValues] = useState<Record<string, string>>({});
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);

  // Review state
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [rowFilter, setRowFilter] = useState('all');
  const [rowPage, setRowPage] = useState(1);
  const [rowTotal, setRowTotal] = useState(0);
  const [loadingRows, setLoadingRows] = useState(false);
  const [committing, setCommitting] = useState(false);

  // Result state
  const [commitResult, setCommitResult] = useState<{ committed: number; failed: number } | null>(null);

  // ─── Step 1: Upload ───
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
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ─── Step 2: Validate ───
  const handleValidate = async () => {
    if (!uploadResult) return;
    setValidating(true);
    try {
      const result = await importer.validate(uploadResult.id, mapping, fixedValues);
      setValidationResult(result);
      setStep('review');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  // ─── Step 3: Load rows ───
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

  // ─── Step 3: Commit ───
  const handleCommit = async () => {
    if (!uploadResult) return;
    setCommitting(true);
    try {
      const result = await importer.commit(uploadResult.id);
      setCommitResult(result);
      setStep('result');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Commit failed');
    } finally {
      setCommitting(false);
    }
  };

  // ─── Reset ───
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
  const steps = ['Upload', 'Map Columns', 'Review', 'Done'];

  return (
    <>
      <PageHeader
        title="Import Data"
        description="Upload CSV, Excel, or JSON files to import data."
        action={
          <Link
            to="/admin/import/history"
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Import History
          </Link>
        }
      />

      {/* Progress bar */}
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

      {/* ─── Step 1: Upload ─── */}
      {step === 'upload' && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">Select entity type and file</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entity Type</label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">Select...</option>
                {ENTITY_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
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
                    <p className="text-sm text-gray-500">Drag & drop a file here, or click to browse</p>
                    <p className="text-xs text-gray-400 mt-1">Supports CSV, Excel (.xlsx), and JSON</p>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleUpload}
              disabled={!file || !entityType || uploading}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? 'Uploading...' : 'Upload & Parse'}
            </button>
          </div>
        </Card>
      )}

      {/* ─── Step 2: Column Mapping ─── */}
      {step === 'mapping' && uploadResult && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-1">Map Columns</h3>
          <p className="text-sm text-gray-500 mb-4">
            {uploadResult.total_rows} rows parsed from <span className="font-medium">{uploadResult.file_name}</span>.
            Map your file columns to the target fields.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2 font-medium text-gray-500">Source Column</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-500">Target Field</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {uploadResult.file_columns.map((col) => (
                  <tr key={col}>
                    <td className="px-4 py-2 font-mono text-gray-700">{col}</td>
                    <td className="px-4 py-2">
                      <select
                        value={mapping[col] || ''}
                        onChange={(e) => setMapping({ ...mapping, [col]: e.target.value })}
                        className="w-full max-w-xs px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      >
                        <option value="">-- Skip --</option>
                        {uploadResult.fields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}{f.required ? ' *' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6">
            <h4 className="font-medium text-gray-900 mb-2">Optional Fixed Values</h4>
            <p className="text-xs text-gray-500 mb-3">
              Set default values directly (used when a source column is not mapped or empty).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Target Field</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Fixed Value</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Expected Format</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {uploadResult.fields.map((f) => (
                    <tr key={`fixed-${f.key}`}>
                      <td className="px-4 py-2">
                        <span className="font-medium text-gray-700">{f.label}</span>
                        {f.required && <span className="text-red-500 ml-1">*</span>}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          value={fixedValues[f.key] || ''}
                          onChange={(e) => setFixedValues({ ...fixedValues, [f.key]: e.target.value })}
                          placeholder="Optional default value"
                          className="w-full max-w-xs px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {f.resolve_table && f.resolve_match
                          ? `${f.resolve_table}.${f.resolve_match}`
                          : f.type === 'enum' && f.enum_values && f.enum_values.length > 0
                            ? f.enum_values.join(', ')
                            : f.type || 'string'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => setStep('upload')}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleValidate}
              disabled={validating || (Object.values(mapping).filter(Boolean).length === 0 && Object.values(fixedValues).filter((v) => String(v).trim() !== '').length === 0)}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {validating ? 'Validating...' : 'Validate'}
            </button>
          </div>
        </Card>
      )}

      {/* ─── Step 3: Review ─── */}
      {step === 'review' && validationResult && uploadResult && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Rows', value: validationResult.total, bg: 'bg-gray-50', color: 'text-gray-800' },
              { label: 'Valid', value: validationResult.valid, bg: 'bg-green-50', color: 'text-green-700' },
              { label: 'Warnings', value: validationResult.warnings, bg: 'bg-yellow-50', color: 'text-yellow-700' },
              { label: 'Errors', value: validationResult.errors, bg: 'bg-red-50', color: 'text-red-700' },
            ].map((c) => (
              <div key={c.label} className={`${c.bg} rounded-xl p-4`}>
                <p className="text-xs font-medium text-gray-500 mb-1">{c.label}</p>
                <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Filter pills */}
          <div className="flex gap-2 mb-4">
            {['all', 'valid', 'warning', 'error'].map((f) => (
              <button
                key={f}
                onClick={() => { setRowFilter(f); setRowPage(1); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  rowFilter === f
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Rows table */}
          {loadingRows ? (
            <Spinner />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2 font-medium text-gray-500 w-16">Row</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500 w-20">Status</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Data</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Issues</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-400">No rows match this filter</td>
                      </tr>
                    ) : rows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-2 text-gray-500">{row.row_number}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            row.status === 'valid' ? 'bg-green-100 text-green-700' :
                            row.status === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                            row.status === 'error' ? 'bg-red-100 text-red-700' :
                            row.status === 'committed' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="text-xs text-gray-600 font-mono max-w-md truncate" title={JSON.stringify(row.mapped_data || row.raw_data)}>
                            {Object.entries(row.mapped_data || row.raw_data).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {row.errors.length > 0 && (
                            <div className="space-y-0.5">
                              {row.errors.map((e, i) => (
                                <p key={i} className="text-xs text-red-600">{e.field}: {e.message}</p>
                              ))}
                            </div>
                          )}
                          {row.warnings.length > 0 && (
                            <div className="space-y-0.5">
                              {row.warnings.map((w, i) => (
                                <p key={i} className="text-xs text-yellow-600">{w.field}: {w.message}</p>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rowTotal > 50 && (
                <div className="border-t border-gray-100 px-4 py-2 flex items-center justify-between text-sm text-gray-500">
                  <span>Showing {rows.length} of {rowTotal}</span>
                  <div className="flex gap-2">
                    <button
                      disabled={rowPage <= 1}
                      onClick={() => setRowPage(rowPage - 1)}
                      className="px-3 py-1 border border-gray-200 rounded text-xs disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <button
                      disabled={rowPage * 50 >= rowTotal}
                      onClick={() => setRowPage(rowPage + 1)}
                      className="px-3 py-1 border border-gray-200 rounded text-xs disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep('mapping')}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Back to Mapping
            </button>
            <button
              onClick={handleCommit}
              disabled={committing || (validationResult.valid + validationResult.warnings) === 0}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {committing ? 'Committing...' : `Commit ${validationResult.valid + validationResult.warnings} rows`}
            </button>
          </div>
        </>
      )}

      {/* ─── Step 4: Result ─── */}
      {step === 'result' && commitResult && (
        <Card>
          <div className="text-center py-8">
            <div className="text-5xl mb-4">{commitResult.failed === 0 ? '✓' : '!'}</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Import Complete</h3>
            <p className="text-gray-600 mb-6">
              <span className="font-medium text-green-700">{commitResult.committed} rows</span> imported successfully.
              {commitResult.failed > 0 && (
                <span className="font-medium text-red-600 ml-2">{commitResult.failed} rows failed.</span>
              )}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleReset}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Start Another Import
              </button>
              <Link
                to="/admin/import/history"
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                View History
              </Link>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
