/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { ImportRow, ImportValidationResult } from '../../api/client';
import Spinner from '../../components/Spinner';

interface ImportReviewStepProps {
  validationResult: ImportValidationResult;
  rows: ImportRow[];
  rowFilter: string;
  setRowFilter: (v: string) => void;
  rowPage: number;
  setRowPage: (v: number) => void;
  rowTotal: number;
  loadingRows: boolean;
  committing: boolean;
  onBackToMapping: () => void;
  onCommit: () => void;
}

export default function ImportReviewStep({
  validationResult,
  rows,
  rowFilter,
  setRowFilter,
  rowPage,
  setRowPage,
  rowTotal,
  loadingRows,
  committing,
  onBackToMapping,
  onCommit,
}: ImportReviewStepProps) {
  const t = useTranslations('pages.admin.import');
  const tFields = useTranslations('common.fields');
  const tTable = useTranslations('common.table');

  const filterOptions = [
    { key: 'all', label: t('filters.all') },
    { key: 'valid', label: t('filters.valid') },
    { key: 'warning', label: t('filters.warning') },
    { key: 'error', label: t('filters.error') },
  ];

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: t('summary.totalRows'), value: validationResult.total, bg: 'bg-gray-50', color: 'text-gray-800' },
          { label: t('summary.valid'), value: validationResult.valid, bg: 'bg-green-50', color: 'text-green-700' },
          { label: t('summary.warnings'), value: validationResult.warnings, bg: 'bg-yellow-50', color: 'text-yellow-700' },
          { label: t('summary.errors'), value: validationResult.errors, bg: 'bg-red-50', color: 'text-red-700' },
        ].map((c) => (
          <div key={c.label} className={`${c.bg} rounded-xl p-4`}>
            <p className="text-xs font-medium text-gray-500 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        {filterOptions.map((f) => (
          <button
            key={f.key}
            onClick={() => { setRowFilter(f.key); setRowPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              rowFilter === f.key
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loadingRows ? (
        <Spinner />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2 font-medium text-gray-500 w-16">{t('table.row')}</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-500 w-20">{tFields('status')}</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-500">{t('table.data')}</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-500">{t('table.issues')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">{t('noRowsMatch')}</td>
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
              <span>{t('showing', { shown: rows.length, total: rowTotal })}</span>
              <div className="flex gap-2">
                <button
                  disabled={rowPage <= 1}
                  onClick={() => setRowPage(rowPage - 1)}
                  className="px-3 py-1 border border-gray-200 rounded text-xs disabled:opacity-50"
                >
                  {tTable('prev')}
                </button>
                <button
                  disabled={rowPage * 50 >= rowTotal}
                  onClick={() => setRowPage(rowPage + 1)}
                  className="px-3 py-1 border border-gray-200 rounded text-xs disabled:opacity-50"
                >
                  {tTable('next')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={onBackToMapping}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          {t('backToMapping')}
        </button>
        <button
          onClick={onCommit}
          disabled={committing || (validationResult.valid + validationResult.warnings) === 0}
          className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {committing ? t('committing') : t('commitRows', { count: validationResult.valid + validationResult.warnings })}
        </button>
      </div>
    </>
  );
}
