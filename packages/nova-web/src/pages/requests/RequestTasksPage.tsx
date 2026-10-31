/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { requests as requestsApi } from '../../api/client';
import type { RequestTaskListItem, Pagination } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import DataTable, { type DataColumnDef } from '../../components/DataTable';
import { Button } from '../../components/ui/button';
import { useListParams } from '../../hooks/useListParams';
import { useResettingState } from '../../hooks/useSyncedState';
import { useCsvExport } from '@/hooks/useCsvExport';
import FilterPresetsBar from '@/components/FilterPresetsBar';
import { useAuth } from '../../context/AuthContext';
import { useFieldLabel, useStatusLabel } from '@/i18n/hooks';
import {
  STATUS_OPTIONS,
  DEFAULT_COLS,
  PRESETS_KEY,
  type RequestTaskListLabels,
  createRequestTaskListParams,
  buildRequestTaskColumns,
  REQUEST_TASK_CSV_HEADERS,
} from './requestTasksConfig';

export default function RequestTasksPage() {
  const tTasks = useTranslations('pages.requests.tasksPage');
  const tList = useTranslations('common.list');
  const tMaster = useTranslations('common.masterData');
  const tTable = useTranslations('common.table');
  const fieldLabel = useFieldLabel();
  const statusLabel = useStatusLabel();
  const listLabels = useMemo<RequestTaskListLabels>(
    () => ({
      field: fieldLabel,
      emDash: tTable('emDash'),
      unassigned: tTasks('unassigned'),
    }),
    [fieldLabel, tTable, tTasks],
  );

  const navigate = useNavigate();
  const { user } = useAuth();
  const { params, setSearch, setSort, setCols, setPage, setFilter, setColumnFilter, update } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['status'],
    storageKey: 'request_tasks_page',
  });

  const [data, setData] = useState<RequestTaskListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const { exporting, exportCsv } = useCsvExport('request-tasks');
  const [refreshKey, setRefreshKey] = useState(0);

  const rawStatusFilter = params.filters.status || '';
  const statusFilter = rawStatusFilter;
  const cfKey = JSON.stringify(params.columnFilters);
  const listKey = `${params.page}|${statusFilter}|${params.search}|${params.sort}|${params.dir}|${cfKey}|${refreshKey}`;
  const [selectedIds, setSelectedIds] = useResettingState<string[]>([], listKey);
  const [prevListKey, setPrevListKey] = useState(listKey);
  if (listKey !== prevListKey) {
    setPrevListKey(listKey);
    setLoading(true);
  }

  useEffect(() => {
    const apiParams = createRequestTaskListParams({
      statusFilter,
      search: params.search,
      sort: params.sort,
      dir: params.dir,
      columnFilters: params.columnFilters,
    });
    requestsApi.taskQueue(apiParams, params.page, 20).then((res) => {
      setData(res.tasks);
      setPagination(res.pagination);
      setLoading(false);
    }).catch(() => setLoading(false));
    // params.columnFilters is depended on by value via cfKey (stringified), not by identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.page, statusFilter, params.search, params.sort, params.dir, cfKey, refreshKey]);

  const handleComplete = async (task: RequestTaskListItem, outcome: string) => {
    setActionLoadingId(task.id);
    try {
      await requestsApi.completeTask(task.request_id, task.id, { outcome });
      setRefreshKey((k) => k + 1);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAssign = async (task: RequestTaskListItem) => {
    setActionLoadingId(task.id);
    try {
      await requestsApi.assignTask(task.request_id, task.id);
      setRefreshKey((k) => k + 1);
    } finally {
      setActionLoadingId(null);
    }
  };

  const columns = useMemo<DataColumnDef<RequestTaskListItem>[]>(
    () => buildRequestTaskColumns(listLabels),
    [listLabels],
  );

  const rowActions = useCallback((task: RequestTaskListItem) => {
    const isActive = task.status === 'in_progress';
    const isLoading = actionLoadingId === task.id;
    const approvalSubjectId = task.requested_for ?? task.requester_id;
    // Block only classic manager-of-subject self-approval; explicit assignees may decide.
    const isSelfApprovalBlocked =
      task.task_type === 'approval'
      && approvalSubjectId === user?.id
      && !task.assigned_to;
    const canAssign = task.task_type !== 'approval' && !task.assigned_to && task.status !== 'completed';
    const canApprove = isActive && task.task_type === 'approval' && !isSelfApprovalBlocked;
    const canComplete = isActive && task.task_type !== 'approval';

    if (!isActive && task.status !== 'pending') return null;
    if (!canAssign && !canApprove && !canComplete) return null;

    return (
      <div className="flex items-center gap-1.5 flex-nowrap">
        {canAssign && (
          <button
            onClick={(e) => { e.stopPropagation(); handleAssign(task); }}
            disabled={isLoading}
            className="px-2.5 py-1 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-50 disabled:opacity-50 whitespace-nowrap"
          >
            {tTasks('actions.assignToMe')}
          </button>
        )}
        {canApprove && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); handleComplete(task, 'rejected'); }}
              disabled={isLoading}
              className="px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
            >
              {tTasks('actions.reject')}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleComplete(task, 'approved'); }}
              disabled={isLoading}
              className="px-2.5 py-1 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
            >
              {tTasks('actions.approve')}
            </button>
          </>
        )}
        {canComplete && (
          <button
            onClick={(e) => { e.stopPropagation(); handleComplete(task, 'completed'); }}
            disabled={isLoading}
            className="px-2.5 py-1 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
          >
            {tTasks('actions.complete')}
          </button>
        )}
      </div>
    );
  }, [actionLoadingId, user?.id, tTasks]);

  const hasActiveFilter = !!params.search || statusFilter !== '' || Object.values(params.columnFilters).some(Boolean);
  const getListParams = useCallback((): Record<string, string> => {
    const lp = createRequestTaskListParams({
      statusFilter,
      search: params.search,
      sort: params.sort,
      dir: params.dir,
      columnFilters: params.columnFilters,
    });
    delete lp.assigned_to_me;
    return lp;
  }, [statusFilter, params.search, params.sort, params.dir, params.columnFilters]);

  return (
    <>
      <PageHeader
        title={tTasks('title')}
        description={tTasks('description')}
      />

      <FilterPresetsBar
        storageKey={PRESETS_KEY}
        current={{ search: params.search, status: rawStatusFilter, columnFilters: params.columnFilters }}
        hasActiveFilter={hasActiveFilter}
        onApply={(preset) => update({ search: preset.search, filters: { status: preset.status }, columnFilters: preset.columnFilters, page: 1 })}
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar
            value={params.search}
            onChange={setSearch}
            placeholder={tTasks('searchPlaceholder')}
          />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter('status', s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s === '' ? tTasks('filters.active') : statusLabel(s)}
            </button>
          ))}
          <Button
            size="sm"
            variant="outline"
            disabled={exporting}
            onClick={() => exportCsv(REQUEST_TASK_CSV_HEADERS, selectedIds, data, (page) =>
              requestsApi.taskQueue(createRequestTaskListParams({ statusFilter, search: params.search, sort: params.sort, dir: params.dir, columnFilters: params.columnFilters }), page, 100)
              .then((r) => ({ rows: r.tasks, pages: r.pagination.pages })),
            )}
          >
            {exporting ? tList('exporting') : tList('exportCsv')}
          </Button>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl mb-4">
          <span className="text-sm font-semibold text-indigo-900">{tList('selected', { count: selectedIds.length })}</span>
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
              ? tTasks('emptySearch', { query: params.search })
              : tTasks('empty')
          }
          onRowClick={(task) => navigate(`/request-tasks/${task.id}`, { state: { listParams: getListParams() } })}
          rowActions={rowActions}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
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
