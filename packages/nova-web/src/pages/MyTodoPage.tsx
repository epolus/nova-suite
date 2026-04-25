/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { incidents as incidentsApi, requests as requestsApi } from '../api/client';
import type { AssignmentGroupItem, Incident, Pagination } from '../api/client';
import PageHeader from '../components/PageHeader';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';
import SearchBar from '../components/SearchBar';
import DataTable, { type DataColumnDef } from '../components/DataTable';
import { Button } from '../components/ui/button';
import { useListParams } from '../hooks/useListParams';
import { useUserPreferenceState } from '../hooks/useUserPreferenceState';
import RequestTasksTab from '../components/RequestTasksTab';
import { formatDate } from '../utils/dateTime';
import { useAuth } from '../context/AuthContext';
import { isAgentRole } from '../utils/roles';
import { TODO_BULK_ACTIONS, TODO_INCIDENT_STATUS_OPTIONS } from './todo/todoListConfig';

const priorityLabels: Record<number, string> = {
  1: 'P1 Critical',
  2: 'P2 High',
  3: 'P3 Moderate',
  4: 'P4 Low',
  5: 'P5 Planning',
};

const STATUS_OPTIONS = ['', 'new', 'assigned', 'in_progress', 'pending'];

const DEFAULT_COLS = ['number', 'title', 'priority', 'status', 'assignment_group_name', 'sla', 'updated_at'];
const PRESETS_KEY = 'nova_filter_presets_my_todo_incidents';

interface FilterPreset {
  id: string;
  name: string;
  search: string;
  status: string;
  columnFilters: Record<string, string>;
}

function buildColumns(listParams: Record<string, string>): DataColumnDef<Incident>[] {
  return [
    {
      key: 'number',
      label: 'Number',
      sortable: true,
      defaultVisible: true,
      render: (inc) => (
        <Link
          to={`/incidents/${inc.id}`}
          state={{ listParams }}
          className="text-indigo-600 font-medium hover:text-indigo-800"
          onClick={(e) => e.stopPropagation()}
        >
          {inc.number}
        </Link>
      ),
    },
    {
      key: 'title',
      label: 'Title',
      sortable: true,
      defaultVisible: true,
      className: 'max-w-xs truncate',
      render: (inc) => <span className="text-gray-900">{inc.title}</span>,
    },
    {
      key: 'priority',
      label: 'Priority',
      sortable: true,
      defaultVisible: true,
      render: (inc) => (
        <span
          className={`text-xs font-bold ${
            inc.priority <= 2 ? 'text-red-600' : inc.priority === 3 ? 'text-yellow-600' : 'text-gray-500'
          }`}
        >
          {priorityLabels[inc.priority] || `P${inc.priority}`}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      defaultVisible: true,
      render: (inc) => <Badge value={inc.status} />,
    },
    {
      key: 'assignment_group_name',
      label: 'Assignment Group',
      sortable: true,
      defaultVisible: true,
      render: (inc) => <span className="text-gray-500">{inc.assignment_group_name || '—'}</span>,
    },
    {
      key: 'category',
      label: 'Category',
      sortable: true,
      defaultVisible: false,
      render: (inc) => <span className="text-gray-500">{inc.category || '—'}</span>,
    },
    {
      key: 'impact',
      label: 'Impact',
      sortable: true,
      defaultVisible: false,
      render: (inc) => <span className="capitalize text-gray-600">{inc.impact}</span>,
    },
    {
      key: 'urgency',
      label: 'Urgency',
      sortable: true,
      defaultVisible: false,
      render: (inc) => <span className="capitalize text-gray-600">{inc.urgency}</span>,
    },
    {
      key: 'sla',
      label: 'SLA',
      sortable: true,
      defaultVisible: true,
      render: (inc) =>
        inc.sla_breached ? (
          <span className="text-xs font-bold text-red-600">BREACHED</span>
        ) : inc.sla_due_at ? (
          <span className="text-xs text-gray-500">{formatDate(inc.sla_due_at)}</span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'updated_at',
      label: 'Updated',
      sortable: true,
      defaultVisible: true,
      render: (inc) => (
        <span className="text-gray-500 text-xs">{formatDate(inc.updated_at)}</span>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      defaultVisible: false,
      render: (inc) => (
        <span className="text-gray-500 text-xs">{formatDate(inc.created_at)}</span>
      ),
    },
  ];
}

function IncidentsTab() {
  const { user } = useAuth();
  const isAgent = isAgentRole(user?.roles);
  const { params, setSearch, setSort, setCols, setPage, setFilter, setColumnFilter, update } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['status'],
    storageKey: 'my_todo',
  });

  const [data, setData] = useState<Incident[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [bulkGroupId, setBulkGroupId] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [presets, setPresets] = useUserPreferenceState<FilterPreset[]>(
    `presets:${PRESETS_KEY}`,
    [],
    PRESETS_KEY,
  );
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [savePresetName, setSavePresetName] = useState('');

  const rawStatusFilter = params.filters.status || '';
  const statusFilter = rawStatusFilter;
  const cfKey = JSON.stringify(params.columnFilters);

  useEffect(() => {
    if (!isAgent) return;
    incidentsApi.assignmentGroups().then((r) => setGroups(r.assignment_groups)).catch(() => {});
  }, [isAgent]);

  useEffect(() => {
    setLoading(true);
    setSelectedIds([]);
    const apiParams: Record<string, string> = { assigned_to_me: 'true', my_groups: 'true' };
    if (statusFilter) apiParams.status = statusFilter;
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (val) apiParams[`cf.${col}`] = val;
    }
    if (params.search) apiParams.search = params.search;
    if (params.sort) {
      apiParams.sort_by = params.sort === 'sla' ? 'sla_due_at' : params.sort;
      apiParams.sort_dir = params.dir;
    }
    incidentsApi.list(apiParams, params.page, 20).then((res) => {
      setData(res.incidents);
      setPagination(res.pagination);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [params.page, statusFilter, cfKey, params.search, params.sort, params.dir, refreshKey]);

  const getListParams = useCallback((): Record<string, string> => {
    const lp: Record<string, string> = { assigned_to_me: 'true', my_groups: 'true' };
    if (statusFilter) lp.status = statusFilter;
    if (params.search) lp.search = params.search;
    if (params.sort) {
      lp.sort_by = params.sort === 'sla' ? 'sla_due_at' : params.sort;
      lp.sort_dir = params.dir;
    }
    return lp;
  }, [statusFilter, params.search, params.sort, params.dir]);

  const columns = useMemo(() => buildColumns(getListParams()), [getListParams]);

  const handleBulkAssign = async () => {
    if (!bulkGroupId || selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      await incidentsApi.bulkUpdate(selectedIds, 'assign_group', bulkGroupId);
      setSelectedIds([]);
      setBulkGroupId('');
      setRefreshKey((k) => k + 1);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkClose = async () => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      await incidentsApi.bulkUpdate(selectedIds, 'close');
      setSelectedIds([]);
      setConfirmClose(false);
      setRefreshKey((k) => k + 1);
    } finally {
      setBulkLoading(false);
    }
  };

  const hasActiveFilter = !!params.search || statusFilter !== '' || Object.values(params.columnFilters).some(Boolean);
  const applyPreset = (preset: FilterPreset) => {
    update({ search: preset.search, filters: { status: preset.status }, columnFilters: preset.columnFilters, page: 1 });
  };
  const savePreset = () => {
    if (!savePresetName.trim()) return;
    const next: FilterPreset[] = [...presets, {
      id: crypto.randomUUID(),
      name: savePresetName.trim(),
      search: params.search,
      status: rawStatusFilter,
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
      const allIncidents = selectedIds.length > 0
        ? data.filter((incident) => selectedIds.includes(incident.id))
        : await (async () => {
            const apiParams: Record<string, string> = { assigned_to_me: 'true', my_groups: 'true' };
            if (statusFilter) apiParams.status = statusFilter;
            if (params.search) apiParams.search = params.search;
            if (params.sort) {
              apiParams.sort_by = params.sort === 'sla' ? 'sla_due_at' : params.sort;
              apiParams.sort_dir = params.dir;
            }
            for (const [col, val] of Object.entries(params.columnFilters)) {
              if (val) apiParams[`cf.${col}`] = val;
            }
            const firstPage = await incidentsApi.list(apiParams, 1, 100);
            const rows = [...firstPage.incidents];
            for (let page = 2; page <= firstPage.pagination.pages; page += 1) {
              const nextPage = await incidentsApi.list(apiParams, page, 100);
              rows.push(...nextPage.incidents);
            }
            return rows;
          })();
      const headers = ['number', 'title', 'status', 'priority', 'assignment_group_name', 'sla_due_at', 'sla_breached', 'updated_at'];
      const getField = (incident: Incident, header: string): unknown => {
        switch (header) {
          case 'number': return incident.number;
          case 'title': return incident.title;
          case 'status': return incident.status;
          case 'priority': return incident.priority;
          case 'assignment_group_name': return incident.assignment_group_name;
          case 'sla_due_at': return incident.sla_due_at;
          case 'sla_breached': return incident.sla_breached;
          case 'updated_at': return incident.updated_at;
          default: return '';
        }
      };
      const csvEscape = (value: unknown) => {
        const str = String(value ?? '');
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      };
      const lines = [headers.join(','), ...allIncidents.map((incident) => headers.map((h) => csvEscape(getField(incident, h))).join(','))];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const a = document.createElement('a');
      a.href = url;
      a.download = selectedIds.length > 0 ? `my-todo-incidents-selected-${ts}.csv` : `my-todo-incidents-${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
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

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar
            value={params.search}
            onChange={setSearch}
            placeholder="Search by number, title, description..."
          />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {TODO_INCIDENT_STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter('status', s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s === '' ? 'All Open' : s.replace(/_/g, ' ')}
            </button>
          ))}
          {isAgent && (
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          )}
        </div>
      </div>

      {isAgent && selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl mb-4 flex-wrap">
          <span className="text-sm font-semibold text-indigo-900">{selectedIds.length} selected</span>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={bulkGroupId}
              onChange={(e) => setBulkGroupId(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">Assign to group...</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            {TODO_BULK_ACTIONS.map((action) => {
              if (action.id === 'assign_group') {
                return (
                  <Button
                    key={action.id}
                    size="sm"
                    variant={action.variant}
                    disabled={(action.requiresGroup && !bulkGroupId) || bulkLoading}
                    onClick={handleBulkAssign}
                  >
                    {action.label}
                  </Button>
                );
              }
              if (action.id === 'close') {
                return confirmClose ? (
                  <span key={action.id} className="inline-flex items-center gap-2">
                    <span className="text-xs text-gray-600">Close {selectedIds.length} incidents?</span>
                    <Button size="sm" variant="warning" disabled={bulkLoading} onClick={handleBulkClose}>Confirm</Button>
                    <button onClick={() => setConfirmClose(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                  </span>
                ) : (
                  <Button key={action.id} size="sm" variant={action.variant} onClick={() => setConfirmClose(true)}>
                    {action.label}
                  </Button>
                );
              }
              return null;
            })}
          </div>
          <button onClick={() => { setSelectedIds([]); setConfirmClose(false); setBulkGroupId(''); }} className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-medium">
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
          emptyMessage={params.search ? `No incidents matching "${params.search}"` : 'No open incidents assigned to you.'}
          onRowClick={(inc) => navigate(`/incidents/${inc.id}`, { state: { listParams: getListParams() } })}
          selectable={isAgent}
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

const TABS = [
  { key: 'incidents', label: 'Incidents' },
  { key: 'tasks', label: 'Request Tasks' },
] as const;

export default function MyTodoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'incidents';

  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [incidentCount, setIncidentCount] = useState<number | null>(null);

  useEffect(() => {
    requestsApi.taskQueue({ assigned_to_me: 'true', my_groups: 'true' }, 1, 1).then((res) =>
      setTaskCount(res.pagination.total),
    ).catch(() => {});
    incidentsApi.list({ assigned_to_me: 'true', my_groups: 'true' }, 1, 1).then((res) =>
      setIncidentCount(res.pagination.total),
    ).catch(() => {});
  }, []);

  const setTab = (tab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'incidents') next.delete('tab');
      else next.set('tab', tab);
      return next;
    }, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="My Todo"
        description="Work items assigned to you that need attention."
      />

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map((tab) => {
          const count = tab.key === 'incidents' ? incidentCount : taskCount;
          return (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {count != null && count > 0 && (
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'incidents' && <IncidentsTab />}
      {activeTab === 'tasks' && <RequestTasksTab filterKey="assigned_to_me_in_my_groups" />}
    </>
  );
}
