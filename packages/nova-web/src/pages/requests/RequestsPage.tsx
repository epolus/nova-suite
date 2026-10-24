/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
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
import { useResettingState } from '../../hooks/useSyncedState';
import { useCsvExport } from '@/hooks/useCsvExport';
import FilterPresetsBar from '@/components/FilterPresetsBar';
import { useAuth } from '../../context/AuthContext';
import { isAgentRole } from '../../utils/roles';
import { useFieldLabel, useStatusLabel } from '@/i18n/hooks';
import { REQUEST_BULK_ACTIONS, REQUEST_STATUS_OPTIONS } from './requestListConfig';
import {
  DEFAULT_COLS,
  PRESETS_KEY,
  type RequestListLabels,
  buildColumns,
  REQUEST_CSV_HEADERS,
} from './requestsPageConfig';

export default function RequestsPage() {
  const tRequests = useTranslations('pages.requests');
  const tList = useTranslations('common.list');
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

  const { exporting, exportCsv } = useCsvExport('requests');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState<'approve' | 'reject' | null>(null);
  const invalidateRequests = useInvalidateRequests();
  const navigate = useNavigate();

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
  const selectionKey = `${params.page}|${isFetching}|${JSON.stringify(apiParams)}`;
  const [selectedIds, setSelectedIds] = useResettingState<string[]>([], selectionKey);

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

      {isAgent && (
        <FilterPresetsBar
          storageKey={PRESETS_KEY}
          current={{ search: params.search, status: rawStatusFilter, active: activeFilter || 'true', columnFilters: params.columnFilters }}
          hasActiveFilter={hasActiveFilter}
          onApply={(preset) => update({
            search: preset.search,
            filters: { status: preset.status, active: preset.active || 'true' },
            columnFilters: preset.columnFilters,
            page: 1,
          })}
        />
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
            <Button
              size="sm"
              variant="outline"
              disabled={exporting}
              onClick={() => exportCsv(REQUEST_CSV_HEADERS, selectedIds, data, (page) =>
                requestsApi.list(apiParams, page, 100).then((r) => ({ rows: r.requests, pages: r.pagination.pages })),
              )}
            >
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
