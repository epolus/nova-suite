/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { alerts as alertsApi } from '@/api/client';
import type { AlertListItem, Pagination } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Spinner from '@/components/Spinner';
import SearchBar from '@/components/SearchBar';
import DataTable from '@/components/DataTable';
import { useListParams } from '@/hooks/useListParams';
import FilterPresetsBar from '@/components/FilterPresetsBar';
import { useAuth } from '@/context/AuthContext';
import { useStatusLabel } from '@/i18n/hooks';
import { canViewAlerts } from '@/utils/roles';
import { ALERT_STATUS_OPTIONS, DEFAULT_ALERT_COLS, buildAlertColumns, type AlertListLabels } from './alertColumns';

const PRESETS_KEY = 'nova_filter_presets_alerts';

export default function AlertsPage() {
  const t = useTranslations('pages.alerts');
  const tTable = useTranslations('common.table');
  const statusLabel = useStatusLabel();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { params, setSearch, setSort, setCols, setPage, setFilter, setColumnFilter, update } = useListParams({
    defaultCols: DEFAULT_ALERT_COLS,
    filterKeys: ['status'],
    storageKey: 'alerts',
  });
  const [items, setItems] = useState<AlertListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const statusFilter = params.filters.status || 'firing';
  const apiParams = useMemo(() => {
    const query: Record<string, string> = { status: statusFilter };
    if (params.search) query.search = params.search;
    if (params.sort) {
      query.sort_by = params.sort;
      query.sort_dir = params.dir;
    }
    for (const [col, value] of Object.entries(params.columnFilters)) {
      if (value) query[`cf.${col}`] = value;
    }
    return query;
  }, [statusFilter, params.search, params.sort, params.dir, params.columnFilters]);
  const queryKey = `${params.page}|${JSON.stringify(apiParams)}|${(user?.roles || []).join(',')}`;
  const [prevQueryKey, setPrevQueryKey] = useState(queryKey);
  if (queryKey !== prevQueryKey) {
    setPrevQueryKey(queryKey);
    if (canViewAlerts(user?.roles)) {
      setLoading(true);
      setError('');
    }
  }

  useEffect(() => {
    if (!canViewAlerts(user?.roles)) return;
    let cancelled = false;
    alertsApi.list(apiParams, params.page)
      .then((res) => {
        if (cancelled) return;
        setItems(res.alerts);
        setPagination(res.pagination);
      })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : t('loadFailed')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiParams, params.page, t, user?.roles]);

  const labels = useMemo<AlertListLabels>(() => ({
    number: t('number'),
    title: t('titleLabel'),
    severity: t('severity'),
    status: t('status'),
    source: t('source'),
    ci: t('ci'),
    incident: t('incident'),
    events: t('eventsTitle'),
    firstSeen: t('firstSeen'),
    lastSeen: t('lastSeen'),
    emDash: tTable('emDash'),
    suppressed: (change) => t('suppressed', { change }),
  }), [t, tTable]);
  const columns = useMemo(() => buildAlertColumns(labels), [labels]);
  const hasActiveFilter = !!params.search || statusFilter !== 'firing' || Object.values(params.columnFilters).some(Boolean);

  if (!canViewAlerts(user?.roles)) return <Navigate to="/" replace />;

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      <FilterPresetsBar
        storageKey={PRESETS_KEY}
        current={{ search: params.search, status: statusFilter, columnFilters: params.columnFilters }}
        hasActiveFilter={hasActiveFilter}
        onApply={(preset) => update({
          search: preset.search,
          filters: { status: preset.status === 'firing' ? '' : preset.status },
          columnFilters: preset.columnFilters,
          page: 1,
        })}
      />
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar value={params.search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {ALERT_STATUS_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter('status', value === 'firing' ? '' : value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {statusLabel(value)}
            </button>
          ))}
        </div>
      </div>
      {loading ? <Spinner /> : (
        <DataTable
          columns={columns}
          data={items}
          visibleColumns={params.cols}
          onColumnsChange={setCols}
          sortKey={params.sort}
          sortDir={params.dir}
          onSort={setSort}
          columnFilters={params.columnFilters}
          onColumnFilter={setColumnFilter}
          emptyMessage={params.search ? t('emptySearch', { query: params.search }) : t('empty')}
          onRowClick={(item) => navigate(`/alerts/${item.id}`)}
          pagination={
            pagination && pagination.pages > 1
              ? { page: params.page, pages: pagination.pages, total: pagination.total, onPageChange: setPage }
              : undefined
          }
        />
      )}
    </>
  );
}
