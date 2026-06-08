/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { requests as requestsApi } from '../../api/client';
import type { ServiceRequest } from '../../api/client';
import { useRequestsList, useInvalidateRequests } from '@/hooks/queries';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import DataTable from '../../components/DataTable';
import { Button } from '../../components/ui/button';
import { useListParams } from '../../hooks/useListParams';
import { useUserPreferenceState } from '../../hooks/useUserPreferenceState';
import { useAuth } from '../../context/AuthContext';
import { isAgentRole } from '../../utils/roles';
import { useFieldLabel, useStatusLabel } from '@/i18n/hooks';
import { REQUEST_BULK_ACTIONS, REQUEST_STATUS_OPTIONS } from './requestListConfig';
import {
  DEFAULT_COLS,
  PRESETS_KEY,
  type FilterPreset,
  type RequestListLabels,
  buildColumns,
  REQUEST_CSV_HEADERS,
  getRequestCsvField,
} from './requestsPageConfig';

export default function RequestsPage() {
  const tRequests = useTranslations('pages.requests');
  const tList = useTranslations('common.list');
  const tFilters = useTranslations('common.filters');
  const tActions = useTranslations('common.actions');
  const tMaster = useTranslations('common.masterData');
  const tTable = useTranslations('common.table');
  const fieldLabel = useFieldLabel();
  const statusLabel = useStatusLabel();
  const listLabels = useMemo<RequestListLabels>(
    () => ({ field: fieldLabel, emDash: tTable('emDash') }),
    [fieldLabel, tTable],
  );

  const { user } = useAuth();
  const isAgent = isAgentRole(user?.roles);
  const { params, setSearch, setSort, setCols, setPage, setFilter, setColumnFilter, update } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['status', 'active'],
    storageKey: 'requests',
  });

  const [exporting, setExporting] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState<'approve' | 'reject' | null>(null);
  const invalidateRequests = useInvalidateRequests();
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [presets, setPresets] = useUserPreferenceState<FilterPreset[]>(
    `presets:${PRESETS_KEY}`,
    [],
    PRESETS_KEY,
  );
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [savePresetName, setSavePresetName] = useState('');

  const rawStatusFilter = params.filters.status || '';
  const statusFilter = rawStatusFilter;
  const activeFilter = params.filters.active || '';
  const activeOnly = activeFilter !== 'all';

  const apiParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (statusFilter) p.status = statusFilter;
    else if (activeOnly) p.active = 'true';
    if (params.search) p.search = params.search;
    if (params.sort) {
      p.sort_by = params.sort;
      p.sort_dir = params.dir;
    }
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (val) p[`cf.${col}`] = val;
    }
    return p;
  }, [statusFilter, activeOnly, params.search, params.sort, params.dir, params.columnFilters]);

  const { data: listResult, isLoading: loading, isFetching } = useRequestsList(apiParams, params.page);
  const data: ServiceRequest[] = listResult?.requests ?? [];
  const pagination = listResult?.pagination ?? null;

  useEffect(() => {
    setSelectedIds([]);
  }, [params.page, apiParams, isFetching]);

  const getListParams = useCallback((): Record<string, string> => {
    const lp: Record<string, string> = {};
    if (statusFilter) lp.status = statusFilter;
    else if (activeFilter === 'all') lp.active = 'all';
    else lp.active = 'true';
    if (params.search) lp.search = params.search;
    if (params.sort) {
      lp.sort_by = params.sort;
      lp.sort_dir = params.dir;
    }
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (val) lp[`cf.${col}`] = val;
    }
    return lp;
  }, [statusFilter, activeFilter, params.search, params.sort, params.dir, params.columnFilters]);

  const columns = useMemo(() => buildColumns(getListParams(), listLabels), [getListParams, listLabels]);
  const hasActiveFilter = !!params.search || statusFilter !== '' || activeFilter === 'all' || Object.values(params.columnFilters).some(Boolean);
  const applyPreset = (preset: FilterPreset) => {
    update({
      search: preset.search,
      filters: { status: preset.status, active: preset.active || 'true' },
      columnFilters: preset.columnFilters,
      page: 1,
    });
  };
  const savePreset = () => {
    if (!savePresetName.trim()) return;
    const next: FilterPreset[] = [...presets, {
      id: crypto.randomUUID(),
      name: savePresetName.trim(),
      search: params.search,
      status: rawStatusFilter,
      active: activeFilter || 'true',
      columnFilters: { ...params.columnFilters },
    }];
    setPresets(next);
    setSavePresetName('');
    setShowSaveInput(false);
  };
  const deletePreset = (id: string) => {
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const allRows = selectedIds.length > 0
        ? data.filter((row) => selectedIds.includes(row.id))
        : await (async () => {
            const apiParams: Record<string, string> = {};
            if (statusFilter) apiParams.status = statusFilter;
            if (params.search) apiParams.search = params.search;
            if (params.sort) {
              apiParams.sort_by = params.sort;
              apiParams.sort_dir = params.dir;
            }
            for (const [col, val] of Object.entries(params.columnFilters)) {
              if (val) apiParams[`cf.${col}`] = val;
            }
            const firstPage = await requestsApi.list(apiParams, 1, 100);
            const rows = [...firstPage.requests];
            for (let page = 2; page <= firstPage.pagination.pages; page += 1) {
              const nextPage = await requestsApi.list(apiParams, page, 100);
              rows.push(...nextPage.requests);
            }
            return rows;
          })();

      const headers = REQUEST_CSV_HEADERS;
      const csvEscape = (value: unknown) => {
        const str = String(value ?? '');
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      };
      const lines = [headers.join(','), ...allRows.map((row) => headers.map((h) => csvEscape(getRequestCsvField(row, h))).join(','))];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const a = document.createElement('a');
      a.href = url;
      a.download = selectedIds.length > 0 ? `requests-selected-${ts}.csv` : `requests-${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleBulkApproval = async (action: 'approve' | 'reject') => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      const selectedRows = data.filter((row) => selectedIds.includes(row.id));
      const eligibleRows = selectedRows.filter((row) => row.status === 'pending_approval');
      const skippedCount = selectedRows.length - eligibleRows.length;

      const settled = await Promise.allSettled(eligibleRows.map((row) => requestsApi.approve(row.id, action)));
      const successCount = settled.filter((r) => r.status === 'fulfilled').length;
      const failedCount = settled.length - successCount;

      setPendingBulkAction(null);
      setSelectedIds([]);
      invalidateRequests();

      const resultKey = action === 'approve' ? 'bulk.resultApproved' : 'bulk.resultRejected';
      alert(
        tRequests(resultKey, { count: successCount })
        + (skippedCount ? tRequests('bulk.resultSkipped', { count: skippedCount }) : '')
        + (failedCount ? tRequests('bulk.resultFailed', { count: failedCount }) : ''),
      );
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title={tRequests('title')}
        description={tRequests('description')}
        action={
          <Link
            to="/catalog"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + {tRequests('newRequest')}
          </Link>
        }
      />

      {isAgent && (presets.length > 0 || hasActiveFilter) && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs font-medium text-gray-400">{tFilters('saved')}</span>
          {presets.map((preset) => (
            <div key={preset.id} className="flex items-center gap-0.5 pl-2.5 pr-1.5 py-1 rounded-full bg-white border border-gray-200 text-xs text-gray-700">
              <button onClick={() => applyPreset(preset)} className="hover:text-indigo-600 transition-colors">{preset.name}</button>
              <button onClick={() => deletePreset(preset.id)} className="ml-1 text-gray-300 hover:text-red-500 transition-colors leading-none">&#10005;</button>
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
                className="px-2 py-1 text-xs border border-indigo-300 rounded-full outline-none focus:ring-1 focus:ring-indigo-400 w-36"
              />
              <button onClick={savePreset} disabled={!savePresetName.trim()} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-40">{tActions('save')}</button>
              <button onClick={() => { setShowSaveInput(false); setSavePresetName(''); }} className="text-xs text-gray-400 hover:text-gray-600">{tActions('cancel')}</button>
            </div>
          ) : hasActiveFilter && (
            <button
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
          <SearchBar
            value={params.search}
            onChange={setSearch}
            placeholder={tRequests('searchPlaceholder')}
          />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={() => update({ filters: { ...params.filters, active: 'true' }, page: 1 })}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeOnly
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tRequests('filters.active')}
          </button>
          <button
            onClick={() => update({ filters: { ...params.filters, active: 'all' }, page: 1 })}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeFilter === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tRequests('filters.all')}
          </button>
          {REQUEST_STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter('status', s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s === '' ? tRequests('filters.anyStatus') : statusLabel(s)}
            </button>
          ))}
          {isAgent && (
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting}>
              {exporting ? tList('exporting') : tList('exportCsv')}
            </Button>
          )}
        </div>
      </div>

      {isAgent && REQUEST_BULK_ACTIONS.length > 0 && selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl mb-4 flex-wrap">
          <span className="text-sm font-semibold text-indigo-900">{tList('selected', { count: selectedIds.length })}</span>
          <div className="flex items-center gap-2 flex-wrap">
            {REQUEST_BULK_ACTIONS.map((action) => (
              pendingBulkAction === action.id ? (
                <span key={action.id} className="inline-flex items-center gap-2">
                  <span className="text-xs text-gray-600">
                    {action.id === 'approve' ? tRequests('bulk.confirmApprove') : tRequests('bulk.confirmReject')}
                  </span>
                  <Button size="sm" variant={action.id === 'approve' ? 'default' : 'warning'} disabled={bulkLoading} onClick={() => handleBulkApproval(action.id)}>
                    {tMaster('confirm')}
                  </Button>
                  <button onClick={() => setPendingBulkAction(null)} className="text-xs text-gray-500 hover:text-gray-700">{tActions('cancel')}</button>
                </span>
              ) : (
                <Button key={action.id} size="sm" variant={action.variant} disabled={bulkLoading} onClick={() => setPendingBulkAction(action.id)}>
                  {action.id === 'approve' ? tRequests('bulk.approveSelected') : tRequests('bulk.rejectSelected')}
                </Button>
              )
            ))}
          </div>
          <button onClick={() => setSelectedIds([])} className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-medium">
            {tMaster('clearSelection')}
          </button>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          data={data}
          visibleColumns={params.cols}
          onColumnsChange={setCols}
          sortKey={params.sort}
          sortDir={params.dir}
          onSort={setSort}
          columnFilters={params.columnFilters}
          onColumnFilter={setColumnFilter}
          emptyMessage={
            params.search
              ? tRequests('emptySearch', { query: params.search })
              : tRequests('empty')
          }
          onRowClick={(req) => navigate(`/requests/${req.id}`, { state: { listParams: getListParams() } })}
          selectable={isAgent}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          pagination={
            pagination && pagination.pages > 1
              ? {
                  page: params.page,
                  pages: pagination.pages,
                  total: pagination.total,
                  onPageChange: setPage,
                }
              : undefined
          }
        />
      )}
    </>
  );
}
