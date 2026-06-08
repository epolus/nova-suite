/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { DataSource, DataSourceRun } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Spinner from '@/components/Spinner';
import DataSourceStatusBadge from './DataSourceStatusBadge';
import { formatDate } from './dataSourceForm';

interface DataSourceDetailViewProps {
  selectedDs: DataSource;
  runs: DataSourceRun[];
  runsLoading: boolean;
  runningId: string | null;
  expandedRunId: string | null;
  onBack: () => void;
  onRun: (ds: DataSource) => void;
  onEdit: (ds: DataSource) => void;
  onRefresh: () => void;
  onToggleExpand: (id: string | null) => void;
}

export default function DataSourceDetailView({
  selectedDs,
  runs,
  runsLoading,
  runningId,
  expandedRunId,
  onBack,
  onRun,
  onEdit,
  onRefresh,
  onToggleExpand,
}: DataSourceDetailViewProps) {
  const t = useTranslations('pages.admin.dataSources');
  const tActions = useTranslations('common.actions');
  const tStates = useTranslations('common.states');
  const tTable = useTranslations('common.table');

  return (
    <>
      <PageHeader
        title={selectedDs.name}
        description={t('detailDescription')}
        action={
          <button
            onClick={onBack}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            {t('backToList')}
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t('entityType')}</div>
          <div className="font-medium text-gray-900">{selectedDs.entity_type}</div>
        </Card>
        <Card>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t('schedule')}</div>
          <div className="font-medium text-gray-900">
            {selectedDs.schedule_enabled ? (
              <span className="text-green-700">{selectedDs.schedule_cron}</span>
            ) : (
              <span className="text-gray-400">{tStates('disabled')}</span>
            )}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t('lastRunLabel')}</div>
          <div className="flex items-center gap-2">
            <DataSourceStatusBadge status={selectedDs.last_run_status} />
            <span className="text-sm text-gray-500">{formatDate(selectedDs.last_run_at, tTable('emDash'))}</span>
          </div>
        </Card>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => onRun(selectedDs)}
          disabled={runningId === selectedDs.id}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {runningId === selectedDs.id ? t('starting') : t('runNowButton')}
        </button>
        <button
          onClick={() => onEdit(selectedDs)}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          {tActions('edit')}
        </button>
        <button
          onClick={onRefresh}
          disabled={runsLoading}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {tActions('refresh')}
        </button>
      </div>

      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">{t('runHistory')}</h3>
        {runsLoading ? (
          <Spinner />
        ) : runs.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">{t('noRuns')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">{t('table.started')}</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">{t('table.status')}</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">{t('table.trigger')}</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">{t('table.total')}</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">{t('table.committed')}</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">{t('table.errors')}</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">{t('table.skipped')}</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">{t('table.duration')}</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const duration = run.completed_at
                    ? `${Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s`
                    : tTable('emDash');
                  const hasErrors = run.error_rows > 0 || run.error_message || (run.error_samples && run.error_samples.length > 0);
                  const isExpanded = expandedRunId === run.id;
                  return (
                    <>
                      <tr
                        key={run.id}
                        className={`border-b border-gray-100 hover:bg-gray-50 ${hasErrors ? 'cursor-pointer' : ''}`}
                        onClick={() => hasErrors && onToggleExpand(isExpanded ? null : run.id)}
                      >
                        <td className="py-2 px-3 text-gray-600">{formatDate(run.started_at, tTable('emDash'))}</td>
                        <td className="py-2 px-3"><DataSourceStatusBadge status={run.status} /></td>
                        <td className="py-2 px-3 text-gray-500">{run.trigger_type}</td>
                        <td className="py-2 px-3 text-right font-mono text-gray-700">{run.total_rows}</td>
                        <td className="py-2 px-3 text-right font-mono text-green-600">{run.committed_rows}</td>
                        <td className="py-2 px-3 text-right font-mono text-red-600">{run.error_rows}</td>
                        <td className="py-2 px-3 text-right font-mono text-gray-500">{run.skipped_rows}</td>
                        <td className="py-2 px-3 text-gray-500">{duration}</td>
                        <td className="py-2 px-3 text-gray-400 text-xs">
                          {hasErrors && (isExpanded ? '▲' : '▼')}
                        </td>
                      </tr>
                      {isExpanded && hasErrors && (
                        <tr key={`${run.id}-detail`}>
                          <td colSpan={9} className="bg-red-50/50 px-4 py-3">
                            {run.error_message && (
                              <div className="mb-3 p-2 bg-red-100 border border-red-200 rounded-lg text-xs text-red-800">
                                <span className="font-semibold">{t('runError')}</span> {run.error_message}
                              </div>
                            )}
                            {run.run_meta?.detected_columns && (
                              <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                                <span className="font-semibold text-blue-800">{t('detectedColumns')}</span>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {run.run_meta.detected_columns.map((col) => (
                                    <span key={col} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-mono">{col}</span>
                                  ))}
                                </div>
                                {run.run_meta.mapping_used && Object.keys(run.run_meta.mapping_used).length > 0 && (
                                  <div className="mt-2">
                                    <span className="font-semibold text-blue-800">{t('mappingApplied')}</span>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {Object.entries(run.run_meta.mapping_used).map(([src, tgt]) => {
                                        const found = run.run_meta?.detected_columns?.includes(src);
                                        return (
                                          <span key={src} className={`px-1.5 py-0.5 rounded font-mono ${found ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {src} → {tgt} {!found && t('notFound')}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            {run.error_samples && run.error_samples.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-red-800 mb-2">
                                  {t('errorSamples', { count: run.error_samples.length, total: run.error_rows })}
                                </p>
                                <div className="space-y-2">
                                  {run.error_samples.map((sample, i) => (
                                    <div key={i} className="p-2 bg-white border border-red-200 rounded-lg text-xs">
                                      <div className="flex items-start gap-2">
                                        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-mono flex-shrink-0">
                                          {t('row', { index: sample.row_index })}
                                        </span>
                                        <span className="text-red-700 font-medium">{sample.error}</span>
                                      </div>
                                      {sample.mapped_data && (
                                        <div className="mt-1.5 p-1.5 bg-amber-50 border border-amber-200 rounded font-mono text-amber-800 overflow-x-auto">
                                          <span className="text-amber-500 text-[10px] uppercase font-semibold">{t('mapped')}</span>{' '}
                                          {Object.entries(sample.mapped_data).slice(0, 8).map(([k, v]) => (
                                            <span key={k} className="inline-block mr-3">
                                              <span className="text-amber-500">{k}:</span> {v != null && String(v).length > 0 ? String(v).slice(0, 50) : <span className="text-red-400 font-semibold">{t('null')}</span>}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                      <div className="mt-1.5 p-1.5 bg-gray-50 rounded font-mono text-gray-600 overflow-x-auto">
                                        <span className="text-gray-400 text-[10px] uppercase font-semibold">{t('raw')}</span>{' '}
                                        {Object.entries(sample.data).slice(0, 8).map(([k, v]) => (
                                          <span key={k} className="inline-block mr-3">
                                            <span className="text-gray-400">{k}:</span> {String(v).slice(0, 50) || <span className="text-gray-300 italic">{t('empty')}</span>}
                                          </span>
                                        ))}
                                        {Object.keys(sample.data).length > 8 && (
                                          <span className="text-gray-400">{t('moreColumns', { count: Object.keys(sample.data).length - 8 })}</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {run.error_rows > 0 && (!run.error_samples || run.error_samples.length === 0) && !run.error_message && (
                              <p className="text-xs text-red-600">
                                {t('rowsFailed', { count: run.error_rows })}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
