/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { DataSource } from '@/api/client';
import Card from '@/components/Card';
import PageHeader from '@/components/PageHeader';
import DataSourceStatusBadge from './DataSourceStatusBadge';
import { formatDateTime } from '@/utils/dateTime';

interface DataSourceListViewProps {
  sources: DataSource[];
  runningId: string | null;
  onCreate: () => void;
  onOpen: (ds: DataSource) => void;
  onRun: (ds: DataSource) => void;
  onEdit: (ds: DataSource) => void;
  onDelete: (id: string) => void;
}

export default function DataSourceListView({
  sources,
  runningId,
  onCreate,
  onOpen,
  onRun,
  onEdit,
  onDelete,
}: DataSourceListViewProps) {
  const t = useTranslations('pages.admin.dataSources');
  const tActions = useTranslations('common.actions');

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          <button
            onClick={onCreate}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            {t('newButton')}
          </button>
        }
      />

      {sources.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <span className="text-4xl mb-3 block">🔗</span>
            <h3 className="font-medium text-gray-900 mb-1">{t('emptyTitle')}</h3>
            <p className="text-sm text-gray-500 mb-4">{t('emptyDescription')}</p>
            <button
              onClick={onCreate}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              {t('createButton')}
            </button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {sources.map((ds) => (
            <Card key={ds.id}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpen(ds)}>
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium text-gray-900 hover:text-indigo-600 transition-colors">{ds.name}</h3>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{ds.entity_type}</span>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{ds.source_type}</span>
                    {ds.schedule_enabled ? (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">{ds.schedule_cron}</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-400 rounded text-xs">{t('manualOnly')}</span>
                    )}
                  </div>
                  {ds.description && <p className="text-sm text-gray-500 mt-0.5">{ds.description}</p>}
                  <div className="flex items-center gap-3 mt-1">
                    <DataSourceStatusBadge status={ds.last_run_status} />
                    {ds.last_run_at && (
                      <span className="text-xs text-gray-400">{t('lastRun', { date: formatDateTime(ds.last_run_at) })}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  <button
                    onClick={() => onRun(ds)}
                    disabled={runningId === ds.id}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                    title={t('runNow')}
                  >
                    {runningId === ds.id ? t('starting') : t('run')}
                  </button>
                  <button
                    onClick={() => onEdit(ds)}
                    className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50"
                  >
                    {tActions('edit')}
                  </button>
                  <button
                    onClick={() => onDelete(ds.id)}
                    className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50"
                  >
                    {tActions('delete')}
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
