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
import { useUserPreferenceState } from '@/hooks/useUserPreferenceState';
import { useAuth } from '@/context/AuthContext';
import { useStatusLabel } from '@/i18n/hooks';
import { canViewAlerts } from '@/utils/roles';
import { ALERT_STATUS_OPTIONS, DEFAULT_ALERT_COLS, buildAlertColumns, type AlertListLabels } from './alertColumns';

interface FilterPreset {
  id: string;
  name: string;
  search: string;
  status: string;
  columnFilters: Record<string, string>;
}

const PRESETS_KEY = 'nova_filter_presets_alerts';

export default function AlertsPage() {
  const t = useTranslations('pages.alerts');
  const tFilters = useTranslations('common.filters');
  const tActions = useTranslations('common.actions');
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
  const [presets, setPresets] = useUserPreferenceState<FilterPreset[]>(`presets:${PRESETS_KEY}`, [], PRESETS_KEY);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [savePresetName, setSavePresetName] = useState('');

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

  const applyPreset = (preset: FilterPreset) => {
    update({ search: preset.search, filters: { status: preset.status === 'firing' ? '' : preset.status }, columnFilters: preset.columnFilters, page: 1 });
  };
  const savePreset = () => {
    if (!savePresetName.trim()) return;
    setPresets([...presets, {
      id: crypto.randomUUID(),
      name: savePresetName.trim(),
      search: params.search,
      status: statusFilter,
      columnFilters: { ...params.columnFilters },
    }]);
    setSavePresetName('');
    setShowSaveInput(false);
  };

  if (!canViewAlerts(user?.roles)) return <Navigate to="/" replace />;

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {(presets.length > 0 || hasActiveFilter) && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs font-medium text-gray-400">{tFilters('saved')}</span>
          {presets.map((preset) => (
            <div key={preset.id} className="flex items-center gap-0.5 pl-2.5 pr-1.5 py-1 rounded-full bg-white border border-gray-200 text-xs text-gray-700">
              <button type="button" onClick={() => applyPreset(preset)} className="hover:text-indigo-600 transition-colors">{preset.name}</button>
              <button type="button" onClick={() => setPresets(presets.filter((row) => row.id !== preset.id))} className="ml-1 text-gray-300 hover:text-red-500 transition-colors leading-none">&#10005;</button>
            </div>
          ))}
          {showSaveInput ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={savePresetName}
                onChange={(e) => setSavePresetName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') savePreset(); if (e.key === 'Escape') { setShowSaveInput(false); setSavePresetName(''); } }}
                placeholder={tFilters('filterNamePlaceholder')}
                className="px-2 py-1 text-xs border border-indigo-300 rounded-full outline-hidden focus:ring-1 focus:ring-indigo-400 w-36"
              />
              <button type="button" onClick={savePreset} disabled={!savePresetName.trim()} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-40">{tActions('save')}</button>
              <button type="button" onClick={() => { setShowSaveInput(false); setSavePresetName(''); }} className="text-xs text-gray-400 hover:text-gray-600">{tActions('cancel')}</button>
            </div>
          ) : hasActiveFilter && (
            <button
              type="button"
              onClick={() => setShowSaveInput(true)}
              className="px-2.5 py-1 rounded-full border border-dashed border-gray-300 text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
            >
              + {tFilters('saveCurrent')}
            </button>
          )}
        </div>
      )}
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
