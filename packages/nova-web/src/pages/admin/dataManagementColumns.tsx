/* SPDX-License-Identifier: AGPL-3.0-only */
import type { DataManagementJob } from '@/api/client';
import type { DataColumnDef } from '@/components/DataTable';
import { formatDateTime } from '@/utils/dateTime';

type Translate = (key: string, values?: Record<string, string | number>) => string;

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  running: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

export function dataManagementSortValue(job: DataManagementJob, key: string): unknown {
  if (key === 'actor') return job.actor_name || '';
  if (key === 'created_at') return job.created_at;
  if (key === 'match_count') return job.match_count ?? -1;
  if (key === 'affected_count') return job.affected_count;
  return (job as unknown as Record<string, unknown>)[key];
}

export function compareDataManagementValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
}

export function buildDataManagementColumns(t: Translate): DataColumnDef<DataManagementJob>[] {
  return [
    {
      key: 'created_at',
      label: t('columns.when'),
      sortable: true,
      filterable: true,
      render: (job) => <span className="text-gray-600 whitespace-nowrap">{formatDateTime(job.created_at)}</span>,
    },
    {
      key: 'actor',
      label: t('columns.actor'),
      sortable: true,
      filterable: true,
      render: (job) => job.actor_name || '—',
    },
    {
      key: 'target',
      label: t('target'),
      sortable: true,
      filterable: true,
      render: (job) => t(`targets.${job.target}`),
    },
    {
      key: 'action',
      label: t('columns.action'),
      sortable: true,
      filterable: true,
      render: (job) => t(`actions.${job.action}`),
    },
    {
      key: 'status',
      label: t('columns.jobStatus'),
      sortable: true,
      filterable: true,
      render: (job) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[job.status] || 'bg-gray-100 text-gray-600'}`}>
          {t(`jobStatus.${job.status}`)}
        </span>
      ),
    },
    {
      key: 'match_count',
      label: t('columns.matched'),
      sortable: true,
      render: (job) => job.match_count ?? '—',
    },
    {
      key: 'affected_count',
      label: t('columns.affected'),
      sortable: true,
      render: (job) => job.affected_count,
    },
    {
      key: 'error',
      label: t('columns.error'),
      filterable: true,
      defaultVisible: false,
      render: (job) => <span className="text-red-700">{job.error || ''}</span>,
    },
  ];
}
