/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { requests as requestsApi } from '../../api/client';
import type { ServiceRequest, Pagination } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import DataTable, { type DataColumnDef } from '../../components/DataTable';
import { Button } from '../../components/ui/button';
import { useListParams } from '../../hooks/useListParams';
import { useUserPreferenceState } from '../../hooks/useUserPreferenceState';
import { formatDate, formatDateTime } from '../../utils/dateTime';
import { useAuth } from '../../context/AuthContext';
import { isAgentRole } from '../../utils/roles';
import { REQUEST_BULK_ACTIONS, REQUEST_STATUS_OPTIONS } from './requestListConfig';

const DEFAULT_COLS = ['number', 'service_item_name', 'requester_name', 'priority', 'status', 'created_at'];
const PRESETS_KEY = 'nova_filter_presets_requests';

interface FilterPreset {
  id: string;
  name: string;
  search: string;
  status: string;
  active: string;
  columnFilters: Record<string, string>;
}

function buildColumns(listParams: Record<string, string>): DataColumnDef<ServiceRequest>[] {
  return [
    {
      key: 'number',
      label: 'Number',
      sortable: true,
      defaultVisible: true,
      render: (req) => (
        <Link
          to={`/requests/${req.id}`}
          state={{ listParams }}
          className="text-indigo-600 font-medium hover:text-indigo-800"
          onClick={(e) => e.stopPropagation()}
        >
          {req.number}
        </Link>
      ),
    },
    {
      key: 'service_item_name',
      label: 'Service Item',
      sortable: true,
      defaultVisible: true,
      render: (req) => <span className="text-gray-900">{req.service_item_name || '—'}</span>,
    },
    {
      key: 'requester_name',
      label: 'Requester',
      sortable: true,
      defaultVisible: true,
      render: (req) => <span className="text-gray-500">{req.requester_name || '—'}</span>,
    },
    {
      key: 'priority',
      label: 'Priority',
      sortable: true,
      defaultVisible: true,
      render: (req) => <Badge value={req.priority} />,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      defaultVisible: true,
      render: (req) => <Badge value={req.status} />,
    },
    {
      key: 'approved_by_name',
      label: 'Approved By',
      sortable: false,
      defaultVisible: false,
      render: (req) => <span className="text-gray-500">{req.approved_by_name || '—'}</span>,
    },
    {
      key: 'approved_at',
      label: 'Approved At',
      sortable: true,
      defaultVisible: false,
      render: (req) => (
        <span className="text-gray-500 text-xs">
          {formatDateTime(req.approved_at)}
        </span>
      ),
    },
    {
      key: 'notes',
      label: 'Notes',
      sortable: false,
      defaultVisible: false,
      className: 'max-w-xs truncate',
      render: (req) => <span className="text-gray-500">{req.notes || '—'}</span>,
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      defaultVisible: true,
      render: (req) => (
        <span className="text-gray-500 text-xs">{formatDate(req.created_at)}</span>
      ),
    },
    {
      key: 'updated_at',
      label: 'Updated',
      sortable: true,
      defaultVisible: false,
      render: (req) => (
        <span className="text-gray-500 text-xs">{formatDate(req.updated_at)}</span>
      ),
    },
  ];
}

export default function RequestsPage() {
  const { user } = useAuth();
  const isAgent = isAgentRole(user?.roles);
  const { params, setSearch, setSort, setCols, setPage, setFilter, setColumnFilter, update } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['status', 'active'],
    storageKey: 'requests',
  });

  const [data, setData] = useState<ServiceRequest[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState<'approve' | 'reject' | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
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
  const cfKey = JSON.stringify(params.columnFilters);

  useEffect(() => {
    setLoading(true);
    setSelectedIds([]);
    const apiParams: Record<string, string> = {};
    if (statusFilter) apiParams.status = statusFilter;
    else if (activeOnly) apiParams.active = 'true';
    if (params.search) apiParams.search = params.search;
    if (params.sort) {
      apiParams.sort_by = params.sort;
      apiParams.sort_dir = params.dir;
    }
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (val) apiParams[`cf.${col}`] = val;
    }
    requestsApi.list(apiParams, params.page, 20).then((res) => {
      setData(res.requests);
      setPagination(res.pagination);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [params.page, statusFilter, activeOnly, params.search, params.sort, params.dir, cfKey, refreshKey]);

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

  const columns = useMemo(() => buildColumns(getListParams()), [getListParams]);
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

      const headers = ['number', 'service_item_name', 'requester_name', 'priority', 'status', 'approved_by_name', 'approved_at', 'created_at', 'updated_at'];
      const getField = (row: ServiceRequest, header: string): unknown => {
        switch (header) {
          case 'number': return row.number;
          case 'service_item_name': return row.service_item_name;
          case 'requester_name': return row.requester_name;
          case 'priority': return row.priority;
          case 'status': return row.status;
          case 'approved_by_name': return row.approved_by_name;
          case 'approved_at': return row.approved_at;
          case 'created_at': return row.created_at;
          case 'updated_at': return row.updated_at;
          default: return '';
        }
      };
      const csvEscape = (value: unknown) => {
        const str = String(value ?? '');
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      };
      const lines = [headers.join(','), ...allRows.map((row) => headers.map((h) => csvEscape(getField(row, h))).join(','))];
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
      setRefreshKey((k) => k + 1);

      // eslint-disable-next-line no-alert
      alert(
        `${action === 'approve' ? 'Approved' : 'Rejected'} ${successCount} request(s).`
        + (skippedCount ? ` Skipped ${skippedCount} non-pending request(s).` : '')
        + (failedCount ? ` ${failedCount} failed.` : ''),
      );
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Service Requests"
        description="Track and manage service requests."
        action={
          <Link
            to="/catalog"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + New Request
          </Link>
        }
      />

      {isAgent && (presets.length > 0 || hasActiveFilter) && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs font-medium text-gray-400">Saved:</span>
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
                placeholder="Filter name..."
                className="px-2 py-1 text-xs border border-indigo-300 rounded-full outline-none focus:ring-1 focus:ring-indigo-400 w-36"
              />
              <button onClick={savePreset} disabled={!savePresetName.trim()} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-40">Save</button>
              <button onClick={() => { setShowSaveInput(false); setSavePresetName(''); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
          ) : hasActiveFilter && (
            <button
              onClick={() => setShowSaveInput(true)}
              className="px-2.5 py-1 rounded-full border border-dashed border-gray-300 text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
            >
              + Save current filter
            </button>
          )}
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar
            value={params.search}
            onChange={setSearch}
            placeholder="Search by number, service, requester..."
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
            Active
          </button>
          <button
            onClick={() => update({ filters: { ...params.filters, active: 'all' }, page: 1 })}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeFilter === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            All
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
              {s === '' ? 'Any status' : s.replace(/_/g, ' ')}
            </button>
          ))}
          {isAgent && (
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          )}
        </div>
      </div>

      {isAgent && REQUEST_BULK_ACTIONS.length > 0 && selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl mb-4 flex-wrap">
          <span className="text-sm font-semibold text-indigo-900">{selectedIds.length} selected</span>
          <div className="flex items-center gap-2 flex-wrap">
            {REQUEST_BULK_ACTIONS.map((action) => (
              pendingBulkAction === action.id ? (
                <span key={action.id} className="inline-flex items-center gap-2">
                  <span className="text-xs text-gray-600">
                    {action.id === 'approve' ? 'Approve' : 'Reject'} selected requests?
                  </span>
                  <Button size="sm" variant={action.id === 'approve' ? 'default' : 'warning'} disabled={bulkLoading} onClick={() => handleBulkApproval(action.id)}>
                    Confirm
                  </Button>
                  <button onClick={() => setPendingBulkAction(null)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                </span>
              ) : (
                <Button key={action.id} size="sm" variant={action.variant} disabled={bulkLoading} onClick={() => setPendingBulkAction(action.id)}>
                  {action.label}
                </Button>
              )
            ))}
          </div>
          <button onClick={() => setSelectedIds([])} className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-medium">
            Clear selection
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
          emptyMessage={params.search ? `No requests matching "${params.search}"` : 'No requests found.'}
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
