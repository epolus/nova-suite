/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { DataSource } from '@/api/client';
import type { DataColumnDef } from '@/components/DataTable';
import { formatDateTime } from '@/utils/dateTime';
import DataSourceStatusBadge from './DataSourceStatusBadge';

function sourceTypeLabel(
  t: ReturnType<typeof useTranslations<'pages.admin.dataSources'>>,
  sourceType: DataSource['source_type'],
): string {
  switch (sourceType) {
    case 'csv_url': return t('sourceTypes.csvUrl');
    case 'json_url': return t('sourceTypes.jsonUrl');
    case 'rest_api': return t('sourceTypes.restApi');
    case 'sftp': return t('sourceTypes.sftp');
    case 'intune': return t('sourceTypes.intune');
    default: return sourceType;
  }
}

export function dataSourceSortValue(ds: DataSource, key: string): unknown {
  if (key === 'schedule') return ds.schedule_enabled ? ds.schedule_cron : '';
  if (key === 'last_run_at') return ds.last_run_at;
  if (key === 'last_run_status') return ds.last_run_status || '';
  if (key === 'name') return ds.name;
  return (ds as unknown as Record<string, unknown>)[key];
}

export function compareDataSourceValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

export function buildDataSourceColumns(
  t: ReturnType<typeof useTranslations<'pages.admin.dataSources'>>,
  tFields: ReturnType<typeof useTranslations<'common.fields'>>,
  tTable: ReturnType<typeof useTranslations<'common.table'>>,
): DataColumnDef<DataSource>[] {
  return [
    {
      key: 'name',
      label: tFields('name'),
      sortable: true,
      render: (ds) => (
        <div className="min-w-0">
          <p className="font-medium text-gray-900 truncate">{ds.name}</p>
          {ds.description && <p className="text-xs text-gray-500 truncate">{ds.description}</p>}
        </div>
      ),
    },
    {
      key: 'entity_type',
      label: t('entityType'),
      sortable: true,
      render: (ds) => <span className="text-gray-600">{ds.entity_type}</span>,
    },
    {
      key: 'source_type',
      label: t('sourceType'),
      sortable: true,
      render: (ds) => <span className="text-gray-600">{sourceTypeLabel(t, ds.source_type)}</span>,
    },
    {
      key: 'schedule',
      label: t('schedule'),
      sortable: true,
      render: (ds) => (
        ds.schedule_enabled
          ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-sm text-xs">{ds.schedule_cron}</span>
          : <span className="px-2 py-0.5 bg-gray-100 text-gray-400 rounded-sm text-xs">{t('manualOnly')}</span>
      ),
    },
    {
      key: 'last_run_status',
      label: t('table.status'),
      sortable: true,
      render: (ds) => <DataSourceStatusBadge status={ds.last_run_status} />,
    },
    {
      key: 'last_run_at',
      label: t('lastRunLabel'),
      sortable: true,
      render: (ds) => (
        <span className="text-gray-500">
          {ds.last_run_at ? formatDateTime(ds.last_run_at) : tTable('emDash')}
        </span>
      ),
    },
  ];
}
