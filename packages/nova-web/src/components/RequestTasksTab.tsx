/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from 'use-intl';
import { Link, useNavigate } from 'react-router-dom';
import { requests as requestsApi } from '../api/client';
import type { RequestTaskListItem, Pagination } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Badge from './Badge';
import Spinner from './Spinner';
import SearchBar from './SearchBar';
import DataTable, { type DataColumnDef } from './DataTable';
import { useListParams } from '../hooks/useListParams';
import { formatDate, formatDateTime } from '../utils/dateTime';

const STATUS_OPTIONS = ['', 'pending', 'in_progress', 'completed', 'rejected'];

const DEFAULT_COLS = [
  'number', 'name', 'task_type', 'status', 'request_number',
  'service_item_name', 'assigned_group_name', 'assigned_to_name', 'created_at',
];

const TYPE_COLORS: Record<string, string> = {
  approval: 'bg-amber-100 text-amber-700',
  manual: 'bg-blue-100 text-blue-700',
  automated: 'bg-purple-100 text-purple-700',
};

interface Props {
  filterKey: 'assigned_to_me' | 'my_groups' | 'assigned_to_me_in_my_groups';
}

export default function RequestTasksTab({ filterKey }: Props) {
  const t = useTranslations('components.requestTasksTab');
  const tActions = useTranslations('common.actions');
  const tTable = useTranslations('common.table');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { params, setSearch, setSort, setCols, setPage, setFilter } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['status'],
    prefix: 'rt_',
    storageKey: 'request_tasks',
  });

  const [data, setData] = useState<RequestTaskListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const statusFilter = params.filters.status || '';

  const fetchTasks = useCallback(() => {
    setLoading(true);
    const apiParams: Record<string, string> = filterKey === 'assigned_to_me_in_my_groups'
      ? { assigned_to_me: 'true', my_groups: 'true' }
      : { [filterKey]: 'true' };
    if (statusFilter) apiParams.status = statusFilter;
    if (params.search) apiParams.search = params.search;
    if (params.sort) {
      apiParams.sort_by = params.sort;
      apiParams.sort_dir = params.dir;
    }
    requestsApi.taskQueue(apiParams, params.page, 20).then((res) => {
      setData(res.tasks);
      setPagination(res.pagination);
      setLoading(false);
    });
  }, [filterKey, params.page, statusFilter, params.search, params.sort, params.dir]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleComplete = useCallback(async (task: RequestTaskListItem, outcome: string) => {
    setActionLoadingId(task.id);
    try {
      await requestsApi.completeTask(task.request_id, task.id, { outcome });
      fetchTasks();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoadingId(null);
    }
  }, [fetchTasks]);

  const handleAssign = useCallback(async (task: RequestTaskListItem) => {
    setActionLoadingId(task.id);
    try {
      await requestsApi.assignTask(task.request_id, task.id);
      fetchTasks();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoadingId(null);
    }
  }, [fetchTasks]);

  const columns = useMemo((): DataColumnDef<RequestTaskListItem>[] => [
    {
      key: 'number',
      label: t('columns.number'),
      sortable: true,
      defaultVisible: true,
      render: (t) => <span className="font-mono text-sm text-indigo-600 font-medium">{t.number}</span>,
    },
    {
      key: 'name',
      label: t('columns.name'),
      sortable: true,
      defaultVisible: true,
      render: (t) => (
        <div>
          <span className="font-medium text-gray-900">{t.name}</span>
          {t.description && <p className="text-xs text-gray-400 truncate max-w-xs">{t.description}</p>}
        </div>
      ),
    },
    {
      key: 'task_type',
      label: t('columns.taskType'),
      sortable: true,
      defaultVisible: true,
      render: (t) => (
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[t.task_type]}`}>
          {t.task_type}
        </span>
      ),
    },
    {
      key: 'status',
      label: t('columns.status'),
      sortable: true,
      defaultVisible: true,
      render: (t) => <Badge value={t.status} />,
    },
    {
      key: 'request_number',
      label: t('columns.requestNumber'),
      sortable: true,
      defaultVisible: true,
      render: (t) => (
        <Link
          to={`/requests/${t.request_id}`}
          className="text-indigo-600 font-medium hover:text-indigo-800 text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {t.request_number}
        </Link>
      ),
    },
    {
      key: 'service_item_name',
      label: t('columns.serviceItem'),
      sortable: true,
      defaultVisible: true,
      render: (t) => <span className="text-gray-700 text-sm">{t.service_item_name}</span>,
    },
    {
      key: 'requester_name',
      label: t('columns.requester'),
      sortable: false,
      defaultVisible: false,
      render: (t) => <span className="text-gray-500 text-sm">{t.requester_name}</span>,
    },
    {
      key: 'assigned_group_name',
      label: t('columns.assignedGroup'),
      sortable: true,
      defaultVisible: true,
      render: (task) => <span className="text-gray-500 text-sm">{task.assigned_group_name || tTable('emDash')}</span>,
    },
    {
      key: 'assigned_to_name',
      label: t('columns.assignedTo'),
      sortable: true,
      defaultVisible: true,
      render: (task) => <span className="text-gray-500 text-sm">{task.assigned_to_name || t('unassigned')}</span>,
    },
    {
      key: 'created_at',
      label: t('columns.createdAt'),
      sortable: true,
      defaultVisible: true,
      render: (t) => <span className="text-gray-500 text-xs">{formatDate(t.created_at)}</span>,
    },
    {
      key: 'completed_at',
      label: t('columns.completedAt'),
      sortable: true,
      defaultVisible: false,
      render: (t) => t.completed_at
        ? <span className="text-gray-500 text-xs">{formatDateTime(t.completed_at)}</span>
        : <span className="text-gray-400">{tTable('emDash')}</span>,
    },
  ], [t, tTable]);

  const rowActions = useCallback((task: RequestTaskListItem) => {
    const isActive = task.status === 'in_progress';
    const isLoading = actionLoadingId === task.id;
    const approvalSubjectId = task.requested_for ?? task.requester_id;
    const isSelfApprovalBlocked = task.task_type === 'approval' && approvalSubjectId === user?.id;
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
            {t('assignToMe')}
          </button>
        )}
        {canApprove && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); handleComplete(task, 'rejected'); }}
              disabled={isLoading}
              className="px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
            >
              {t('reject')}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleComplete(task, 'approved'); }}
              disabled={isLoading}
              className="px-2.5 py-1 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
            >
              {tActions('approve')}
            </button>
          </>
        )}
        {canComplete && (
          <button
            onClick={(e) => { e.stopPropagation(); handleComplete(task, 'completed'); }}
            disabled={isLoading}
            className="px-2.5 py-1 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
          >
            {t('complete')}
          </button>
        )}
      </div>
    );
  }, [actionLoadingId, user?.id, t, tActions, handleAssign, handleComplete]);

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar
            value={params.search}
            onChange={setSearch}
            placeholder={t('searchPlaceholder')}
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
              {s === '' ? t('active') : s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

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
          emptyMessage={params.search ? t('emptySearch', { query: params.search }) : t('empty')}
          onRowClick={(task) => navigate(`/request-tasks/${task.id}`)}
          rowActions={rowActions}
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
