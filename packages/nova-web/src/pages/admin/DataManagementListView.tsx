/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { dataManagement } from '@/api/client';
import type { DataManagementJob } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import SearchBar from '@/components/SearchBar';
import DataTable from '@/components/DataTable';
import Spinner from '@/components/Spinner';
import { useListParams } from '@/hooks/useListParams';
import { buildDataManagementColumns, compareDataManagementValues, dataManagementSortValue } from './dataManagementColumns';

const DEFAULT_COLS = ['created_at', 'actor', 'target', 'action', 'status', 'match_count', 'affected_count'];
const PAGE_SIZE = 25;

export default function DataManagementListView() {
  const t = useTranslations('pages.admin.dataManagement');
  const navigate = useNavigate();
  const { params, setSearch, setSort, setCols, setPage, setColumnFilter } = useListParams({
    defaultCols: DEFAULT_COLS,
    storageKey: 'admin_data_management',
  });
  const [jobs, setJobs] = useState<DataManagementJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => dataManagement.jobs()
    .then((res) => {
      setJobs(res.jobs);
      setError('');
    })
    .catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t('loadFailed'));
    });

  useEffect(() => {
    let cancelled = false;
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasActiveJob = jobs.some((job) => job.status === 'pending' || job.status === 'running');
  useEffect(() => {
    if (!hasActiveJob) return undefined;
    const timer = setInterval(() => {
      load().catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveJob]);

  const columns = useMemo(() => buildDataManagementColumns(t), [t]);

  const filtered = useMemo(() => {
    let list = jobs;
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter((job) =>
        (job.actor_name || '').toLowerCase().includes(q)
        || job.action.toLowerCase().includes(q)
        || job.status.toLowerCase().includes(q)
        || job.target.toLowerCase().includes(q)
        || (job.error || '').toLowerCase().includes(q),
      );
    }
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (!val) continue;
      const lower = val.toLowerCase();
      list = list.filter((job) => {
        const raw = dataManagementSortValue(job, col);
        return raw != null && String(raw).toLowerCase().startsWith(lower);
      });
    }
    return list;
  }, [jobs, params.search, params.columnFilters]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const sortKey = params.sort || 'created_at';
    const dir = params.sort ? params.dir : 'desc';
    rows.sort((a, b) => {
      const cmp = compareDataManagementValues(dataManagementSortValue(a, sortKey), dataManagementSortValue(b, sortKey));
      return dir === 'desc' ? -cmp : cmp;
    });
    return rows;
  }, [filtered, params.sort, params.dir]);

  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page, pages);
  const pageRows = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sorted, page],
  );

  useEffect(() => {
    if (params.page !== page) setPage(page);
  }, [params.page, page, setPage]);

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('listDescription')}
        action={
          <button
            type="button"
            onClick={() => navigate('/admin/data-management/new')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            {t('newJob')}
          </button>
        }
      />
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar value={params.search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
        </div>
        <div className="ml-auto text-sm text-gray-500 self-center">
          {t('count', { count: total })}
        </div>
      </div>
      <DataTable
        columns={columns}
        data={pageRows}
        visibleColumns={params.cols}
        onColumnsChange={setCols}
        sortKey={params.sort}
        sortDir={params.dir}
        onSort={setSort}
        columnFilters={params.columnFilters}
        onColumnFilter={setColumnFilter}
        emptyMessage={params.search ? t('empty') : t('empty')}
        onRowClick={(job) => navigate(`/admin/data-management/${job.id}`)}
        pagination={pages > 1 ? { page, pages, total, onPageChange: setPage } : undefined}
      />
    </>
  );
}
