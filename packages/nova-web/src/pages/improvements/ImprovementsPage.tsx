/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { improvements } from '@/api/client';
import type { Improvement } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import Spinner from '@/components/Spinner';
import SearchBar from '@/components/SearchBar';
import DataTable, { type DataColumnDef } from '@/components/DataTable';
import { useListParams } from '@/hooks/useListParams';
import { useStatusLabel } from '@/i18n/hooks';
import { formatDateTime } from '@/utils/dateTime';

const DEFAULT_COLS = ['number', 'title', 'status', 'source_type', 'owner_name', 'updated_at'];
const STATUS_FILTERS = ['all', 'registered', 'in_progress', 'done', 'cancelled'] as const;

function columnText(item: Improvement, key: string, sourceLabel: (source: Improvement['source_type']) => string): string {
  if (key === 'source_type') return sourceLabel(item.source_type);
  if (key === 'owner_name') return item.owner_name || '';
  if (key === 'updated_at') return formatDateTime(item.updated_at);
  const raw = (item as unknown as Record<string, unknown>)[key];
  return raw == null ? '' : String(raw);
}

export default function ImprovementsPage() {
  const t = useTranslations('pages.improvements');
  const tStates = useTranslations('common.states');
  const tTable = useTranslations('common.table');
  const statusLabel = useStatusLabel();
  const navigate = useNavigate();
  const { params, setSearch, setSort, setCols, setFilter, setColumnFilter } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['status'],
    storageKey: 'improvements',
  });
  const [items, setItems] = useState<Improvement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const statusFilter = params.filters.status || 'all';

  useEffect(() => {
    let cancelled = false;
    improvements.list()
      .then((res) => { if (!cancelled) setItems(res.improvements); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : t('loadFailed')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t]);

  const filtered = useMemo(() => {
    let list = items;
    if (statusFilter !== 'all') list = list.filter((item) => item.status === statusFilter);
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter((item) => (
        item.number.toLowerCase().includes(q)
        || item.title.toLowerCase().includes(q)
        || item.status.toLowerCase().includes(q)
        || statusLabel(item.status).toLowerCase().includes(q)
        || t(`sources.${item.source_type}`).toLowerCase().includes(q)
        || (item.owner_name || '').toLowerCase().includes(q)
      ));
    }
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (!val) continue;
      const lower = val.toLowerCase();
      list = list.filter((item) => columnText(item, col, (source) => t(`sources.${source}`)).toLowerCase().startsWith(lower));
    }
    return list;
  }, [items, statusFilter, params.search, params.columnFilters, statusLabel, t]);

  const sorted = useMemo(() => {
    if (!params.sort) return filtered;
    return [...filtered].sort((a, b) => {
      const left = params.sort === 'updated_at' ? a.updated_at : columnText(a, params.sort, (source) => t(`sources.${source}`));
      const right = params.sort === 'updated_at' ? b.updated_at : columnText(b, params.sort, (source) => t(`sources.${source}`));
      const cmp = left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true });
      return params.dir === 'desc' ? -cmp : cmp;
    });
  }, [filtered, params.sort, params.dir, t]);

  const columns = useMemo((): DataColumnDef<Improvement>[] => [
    {
      key: 'number',
      label: t('number'),
      sortable: true,
      render: (item) => (
        <Link to={`/improvements/${item.id}`} onClick={(event) => event.stopPropagation()} className="font-medium text-indigo-700 hover:underline">
          {item.number}
        </Link>
      ),
    },
    { key: 'title', label: t('titleLabel'), sortable: true, render: (item) => <span className="text-gray-900">{item.title}</span> },
    { key: 'status', label: t('status'), sortable: true, render: (item) => <Badge value={item.status} /> },
    { key: 'source_type', label: t('source'), sortable: true, render: (item) => <span className="text-gray-600">{t(`sources.${item.source_type}`)}</span> },
    { key: 'owner_name', label: t('owner'), sortable: true, render: (item) => <span className="text-gray-600">{item.owner_name || tTable('emDash')}</span> },
    { key: 'updated_at', label: t('updated'), sortable: true, render: (item) => <span className="text-gray-500">{formatDateTime(item.updated_at)}</span> },
  ], [t, tTable]);

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          <Link to="/improvements/new" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            {t('newImprovement')}
          </Link>
        }
      />
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar value={params.search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setFilter('status', filter === 'all' ? '' : filter)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === filter
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {filter === 'all' ? tStates('all') : statusLabel(filter)}
            </button>
          ))}
        </div>
        <div className="ml-auto text-sm text-gray-500 self-center">
          {t('count', { count: sorted.length })}
        </div>
      </div>
      <DataTable
        columns={columns}
        data={sorted}
        visibleColumns={params.cols}
        onColumnsChange={setCols}
        sortKey={params.sort}
        sortDir={params.dir}
        onSort={setSort}
        columnFilters={params.columnFilters}
        onColumnFilter={setColumnFilter}
        emptyMessage={params.search ? t('emptySearch', { query: params.search }) : t('empty')}
        onRowClick={(item) => navigate(`/improvements/${item.id}`)}
      />
    </>
  );
}
