/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { releases } from '@/api/client';
import type { Release } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import Spinner from '@/components/Spinner';
import SearchBar from '@/components/SearchBar';
import DataTable, { type DataColumnDef } from '@/components/DataTable';
import { useListParams } from '@/hooks/useListParams';
import { useStatusLabel } from '@/i18n/hooks';
import { formatDateTime } from '@/utils/dateTime';

const DEFAULT_COLS = ['number', 'title', 'status', 'release_type', 'owner_name', 'planned_start'];
const STATUS_FILTERS = ['all', 'planned', 'in_progress', 'deployed', 'cancelled'] as const;

function columnText(release: Release, key: string): string {
  if (key === 'owner_name') return release.owner_name || '';
  if (key === 'planned_start') return release.planned_start ? formatDateTime(release.planned_start) : '';
  const raw = (release as unknown as Record<string, unknown>)[key];
  return raw == null ? '' : String(raw);
}

export default function ReleasesPage() {
  const t = useTranslations('pages.releases');
  const tFields = useTranslations('common.fields');
  const tStates = useTranslations('common.states');
  const tTable = useTranslations('common.table');
  const statusLabel = useStatusLabel();
  const navigate = useNavigate();
  const { params, setSearch, setSort, setCols, setFilter, setColumnFilter } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['status'],
    storageKey: 'releases',
  });
  const [items, setItems] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const statusFilter = params.filters.status || 'all';

  useEffect(() => {
    let cancelled = false;
    releases.list()
      .then((res) => { if (!cancelled) setItems(res.releases); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : t('loadFailed')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t]);

  const filtered = useMemo(() => {
    let list = items;
    if (statusFilter !== 'all') list = list.filter((release) => release.status === statusFilter);
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter((release) => (
        release.number.toLowerCase().includes(q)
        || release.title.toLowerCase().includes(q)
        || release.status.toLowerCase().includes(q)
        || statusLabel(release.status).toLowerCase().includes(q)
        || release.release_type.toLowerCase().includes(q)
        || (release.owner_name || '').toLowerCase().includes(q)
      ));
    }
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (!val) continue;
      const lower = val.toLowerCase();
      list = list.filter((release) => columnText(release, col).toLowerCase().startsWith(lower));
    }
    return list;
  }, [items, statusFilter, params.search, params.columnFilters, statusLabel]);

  const sorted = useMemo(() => {
    if (!params.sort) return filtered;
    return [...filtered].sort((a, b) => {
      const left = params.sort === 'planned_start' ? (a.planned_start || '') : columnText(a, params.sort);
      const right = params.sort === 'planned_start' ? (b.planned_start || '') : columnText(b, params.sort);
      const cmp = left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true });
      return params.dir === 'desc' ? -cmp : cmp;
    });
  }, [filtered, params.sort, params.dir]);

  const columns = useMemo((): DataColumnDef<Release>[] => [
    {
      key: 'number',
      label: t('number'),
      sortable: true,
      render: (release) => (
        <Link to={`/releases/${release.id}`} onClick={(event) => event.stopPropagation()} className="font-medium text-indigo-700 hover:underline">
          {release.number}
        </Link>
      ),
    },
    { key: 'title', label: tFields('title'), sortable: true, render: (release) => <span className="text-gray-900">{release.title}</span> },
    { key: 'status', label: t('status'), sortable: true, render: (release) => <Badge value={release.status} /> },
    { key: 'release_type', label: t('type'), sortable: true, render: (release) => <span className="capitalize text-gray-600">{release.release_type}</span> },
    { key: 'owner_name', label: t('owner'), sortable: true, render: (release) => <span className="text-gray-600">{release.owner_name || tTable('emDash')}</span> },
    {
      key: 'planned_start',
      label: t('plannedStart'),
      sortable: true,
      render: (release) => <span className="text-gray-500">{release.planned_start ? formatDateTime(release.planned_start) : tTable('emDash')}</span>,
    },
  ], [t, tFields, tTable]);

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          <Link to="/releases/new" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            {t('newRelease')}
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
        onRowClick={(release) => navigate(`/releases/${release.id}`)}
      />
    </>
  );
}
