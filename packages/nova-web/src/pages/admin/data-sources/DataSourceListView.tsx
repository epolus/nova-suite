/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import type { DataSource } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import SearchBar from '@/components/SearchBar';
import DataTable from '@/components/DataTable';
import { useListParams } from '@/hooks/useListParams';
import { buildDataSourceColumns, compareDataSourceValues, dataSourceSortValue } from './dataSourceColumns';

interface DataSourceListViewProps {
  sources: DataSource[];
  onCreate: () => void;
  onOpen: (ds: DataSource) => void;
}

const DEFAULT_COLS = ['name', 'entity_type', 'source_type', 'schedule', 'last_run_status', 'last_run_at'];
const PAGE_SIZE = 25;

export default function DataSourceListView({
  sources,
  onCreate,
  onOpen,
}: DataSourceListViewProps) {
  const t = useTranslations('pages.admin.dataSources');
  const tFields = useTranslations('common.fields');
  const tTable = useTranslations('common.table');
  const tStates = useTranslations('common.states');
  const { params, setSearch, setSort, setCols, setPage, setFilter, setColumnFilter } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['schedule'],
    storageKey: 'admin_data_sources',
  });

  const scheduleFilter = params.filters.schedule || 'all';

  const filtered = useMemo(() => {
    let list = sources;
    if (scheduleFilter === 'scheduled') list = list.filter((ds) => ds.schedule_enabled);
    else if (scheduleFilter === 'manual') list = list.filter((ds) => !ds.schedule_enabled);

    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter((ds) =>
        ds.name.toLowerCase().includes(q) ||
        (ds.description && ds.description.toLowerCase().includes(q)) ||
        ds.entity_type.toLowerCase().includes(q) ||
        ds.source_type.toLowerCase().includes(q),
      );
    }

    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (!val) continue;
      const lower = val.toLowerCase();
      list = list.filter((ds) => {
        const raw = dataSourceSortValue(ds, col);
        return raw != null && String(raw).toLowerCase().startsWith(lower);
      });
    }
    return list;
  }, [sources, scheduleFilter, params.search, params.columnFilters]);

  const sorted = useMemo(() => {
    if (!params.sort) return filtered;
    return [...filtered].sort((a, b) => {
      const cmp = compareDataSourceValues(dataSourceSortValue(a, params.sort), dataSourceSortValue(b, params.sort));
      return params.dir === 'desc' ? -cmp : cmp;
    });
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

  const columns = useMemo(
    () => buildDataSourceColumns(t, tFields, tTable),
    [t, tFields, tTable],
  );

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

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar value={params.search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
        </div>
        <div className="flex gap-2 items-center">
          {(['all', 'scheduled', 'manual'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter('schedule', value === 'all' ? '' : value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                (scheduleFilter === value || (value === 'all' && !params.filters.schedule))
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {value === 'all' ? tStates('all') : value === 'scheduled' ? t('filterScheduled') : t('filterManual')}
            </button>
          ))}
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
        emptyMessage={params.search ? t('emptySearch', { query: params.search }) : t('emptyTitle')}
        onRowClick={onOpen}
        pagination={
          pages > 1
            ? { page, pages, total, onPageChange: setPage }
            : undefined
        }
      />
    </>
  );
}
