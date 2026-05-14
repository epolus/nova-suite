/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { incidents as incidentsApi } from '../../api/client';
import type { AssignmentGroupItem, Incident, Pagination } from '../../api/client';
import MajorIncidentBanner from '../../components/MajorIncidentBanner';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import DataTable, { type DataColumnDef } from '../../components/DataTable';
import { Button } from '../../components/ui/button';
import { useListParams } from '../../hooks/useListParams';
import { useUserPreferenceState } from '../../hooks/useUserPreferenceState';
import { formatDate } from '../../utils/dateTime';
import { useAuth } from '../../context/AuthContext';
import { isAgentRole } from '../../utils/roles';
import { INCIDENT_BULK_ACTIONS, INCIDENT_STATUS_OPTIONS } from './incidentListConfig';
import { useTranslations } from 'use-intl';

interface FilterPreset {
  id: string;
  name: string;
  search: string;
  status: string;
  columnFilters: Record<string, string>;
}

const PRESETS_KEY = 'nova_filter_presets_incidents';

const priorityLabels: Record<number, string> = {
  1: 'P1 Critical',
  2: 'P2 High',
  3: 'P3 Moderate',
  4: 'P4 Low',
  5: 'P5 Planning',
};

const DEFAULT_COLS = ['number', 'title', 'priority', 'status', 'assigned_to_name', 'sla', 'created_at'];

function createIncidentListParams(args: {
  statusFilter: string;
  assignedToMe: boolean;
  slaBreached: boolean;
  search: string;
  sort: string;
  dir: string;
  columnFilters: Record<string, string>;
}): Record<string, string> {
  const apiParams: Record<string, string> = {};
  if (args.assignedToMe) {
    apiParams.assigned_to_me = 'true';
  }
  if (args.statusFilter === 'active') {
    apiParams.status_not_in = 'closed,cancelled';
  } else if (args.statusFilter !== 'all') {
    apiParams.status = args.statusFilter;
  }
  if (args.slaBreached) {
    apiParams.sla_breached = 'true';
  }
  if (args.search) apiParams.search = args.search;
  if (args.sort) {
    const sortKey = args.sort === 'sla' ? 'sla_due_at' : args.sort;
    apiParams.sort_by = sortKey;
    apiParams.sort_dir = args.dir;
  }
  for (const [col, val] of Object.entries(args.columnFilters)) {
    if (val) apiParams[`cf.${col}`] = val;
  }
  return apiParams;
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
    key: 'assigned_to_name',
    label: 'Assigned To',
    sortable: true,
    defaultVisible: true,
    render: (inc) => <span className="text-gray-500">{inc.assigned_to_name || '—'}</span>,
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
    key: 'category',
    label: 'Category',
    sortable: true,
    defaultVisible: false,
    render: (inc) => <span className="text-gray-500">{inc.category || '—'}</span>,
  },
  {
    key: 'assignment_group_name',
    label: 'Assignment Group',
    sortable: true,
    defaultVisible: false,
    render: (inc) => <span className="text-gray-500">{inc.assignment_group_name || '—'}</span>,
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
    key: 'created_at',
    label: 'Created',
    sortable: true,
    defaultVisible: true,
    render: (inc) => (
      <span className="text-gray-500 text-xs">{formatDate(inc.created_at)}</span>
    ),
  },
  {
    key: 'updated_at',
    label: 'Updated',
    sortable: true,
    defaultVisible: false,
    render: (inc) => (
      <span className="text-gray-500 text-xs">{formatDate(inc.updated_at)}</span>
    ),
  },
  ];
}

export default function IncidentsPage() {
  const tIncidents = useTranslations('pages.incidents');
  const { user } = useAuth();
  const isEss = !isAgentRole(user?.roles);

  const { params, setSearch, setSort, setCols, setPage, setFilter, setColumnFilter, update } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['status', 'assigned_to_me', 'sla_breached'],
    storageKey: 'incidents',
  });

  const [data, setData] = useState<Incident[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [bulkGroupId, setBulkGroupId] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Saved filter presets
  const [presets, setPresets] = useUserPreferenceState<FilterPreset[]>(
    `presets:${PRESETS_KEY}`,
    [],
    PRESETS_KEY,
  );
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [savePresetName, setSavePresetName] = useState('');

  const rawStatusFilter = params.filters.status || '';
  const statusFilter = rawStatusFilter || 'active';
  const assignedToMeFilter = params.filters.assigned_to_me === 'true';
  const slaBreachedFilter = params.filters.sla_breached === 'true';
  const cfKey = JSON.stringify(params.columnFilters);

  useEffect(() => {
    // Dashboard SLA card should not inherit stale priority column filter state.
    if (!slaBreachedFilter) return;
    const hasPriorityColumnFilter = !!params.columnFilters.priority;
    const hasRawPriorityFilter = searchParams.has('priority');
    if (!hasPriorityColumnFilter && !hasRawPriorityFilter) return;

    if (hasPriorityColumnFilter) {
      const nextFilters = { ...params.columnFilters };
      delete nextFilters.priority;
      update({ columnFilters: nextFilters, page: 1 });
    }

    if (hasRawPriorityFilter) {
      const next = new URLSearchParams(searchParams);
      next.delete('priority');
      setSearchParams(next, { replace: true });
    }
  }, [slaBreachedFilter, params.columnFilters, searchParams, setSearchParams, update]);

  useEffect(() => {
    incidentsApi.assignmentGroups().then((r) => setGroups(r.assignment_groups)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setSelectedIds([]);
    const apiParams = createIncidentListParams({
      statusFilter,
      assignedToMe: assignedToMeFilter,
      slaBreached: slaBreachedFilter,
      search: params.search,
      sort: params.sort,
      dir: params.dir,
      columnFilters: params.columnFilters,
    });
    incidentsApi.list(apiParams, params.page, 20).then((res) => {
      setData(res.incidents);
      setPagination(res.pagination);
      setLoading(false);
    });
  }, [params.page, statusFilter, assignedToMeFilter, slaBreachedFilter, params.search, params.sort, params.dir, cfKey, refreshKey]);

  const getListParams = useCallback((): Record<string, string> => {
    const lp: Record<string, string> = {};
    if (assignedToMeFilter) lp.assigned_to_me = 'true';
    if (slaBreachedFilter) lp.sla_breached = 'true';
    if (statusFilter === 'active') {
      lp.status_not_in = 'closed,cancelled';
    }
    else if (statusFilter !== 'all') lp.status = statusFilter;
    if (params.search) lp.search = params.search;
    if (params.sort) {
      const sortKey = params.sort === 'sla' ? 'sla_due_at' : params.sort;
      lp.sort_by = sortKey;
      lp.sort_dir = params.dir;
    }
    return lp;
  }, [statusFilter, assignedToMeFilter, slaBreachedFilter, params.search, params.sort, params.dir]);

  // ── Bulk actions ──
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

  const exportCsv = async () => {
    setExporting(true);
    try {
      const allIncidents = selectedIds.length > 0
        ? data.filter((incident) => selectedIds.includes(incident.id))
        : await (async () => {
            const paramsForExport = createIncidentListParams({
              statusFilter,
              assignedToMe: assignedToMeFilter,
              slaBreached: slaBreachedFilter,
              search: params.search,
              sort: params.sort,
              dir: params.dir,
              columnFilters: params.columnFilters,
            });
            const limit = 100;
            const firstPage = await incidentsApi.list(paramsForExport, 1, limit);
            const rows = [...firstPage.incidents];
            const totalPages = firstPage.pagination.pages;
            for (let page = 2; page <= totalPages; page += 1) {
              const nextPage = await incidentsApi.list(paramsForExport, page, limit);
              rows.push(...nextPage.incidents);
            }
            return rows;
          })();

      const headers = [
        'number',
        'title',
        'status',
        'priority',
        'impact',
        'urgency',
        'assigned_to_name',
        'assignment_group_name',
        'caller_name',
        'service_name',
        'sla_due_at',
        'sla_breached',
        'created_at',
        'updated_at',
      ];
      const getExportField = (incident: Incident, header: string): unknown => {
        switch (header) {
          case 'number': return incident.number;
          case 'title': return incident.title;
          case 'status': return incident.status;
          case 'priority': return incident.priority;
          case 'impact': return incident.impact;
          case 'urgency': return incident.urgency;
          case 'assigned_to_name': return incident.assigned_to_name;
          case 'assignment_group_name': return incident.assignment_group_name;
          case 'caller_name': return incident.caller_name;
          case 'service_name': return incident.service_name;
          case 'sla_due_at': return incident.sla_due_at;
          case 'sla_breached': return incident.sla_breached;
          case 'created_at': return incident.created_at;
          case 'updated_at': return incident.updated_at;
          default: return '';
        }
      };
      const csvEscape = (value: unknown) => {
        const str = String(value ?? '');
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      };
      const lines = [
        headers.join(','),
        ...allIncidents.map((incident) => headers.map((header) => csvEscape(getExportField(incident, header))).join(',')),
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const a = document.createElement('a');
      a.href = url;
      a.download = selectedIds.length > 0 ? `incidents-selected-${ts}.csv` : `incidents-${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      // Keep UX simple and avoid uncaught promise errors on export failures.
      // eslint-disable-next-line no-alert
      alert(err instanceof Error ? err.message : 'Failed to export incidents');
    } finally {
      setExporting(false);
    }
  };

  // ── Saved filter presets ──
  const hasActiveFilter = !!params.search || statusFilter !== 'active' || Object.values(params.columnFilters).some(Boolean);

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

  const columns = useMemo(() => buildColumns(getListParams()), [getListParams]);

  return (
    <>
      <MajorIncidentBanner />
      <PageHeader
        title={tIncidents('title')}
        description={tIncidents('description')}
        action={
          <Link
            to="/incidents/new"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + {tIncidents('newIncident')}
          </Link>
        }
      />

      {/* Saved filter presets */}
      {!isEss && (presets.length > 0 || hasActiveFilter) && (
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

      {/* Search + Status filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar
            value={params.search}
            onChange={setSearch}
            placeholder="Search by number, title, description, category..."
          />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {INCIDENT_STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter('status', s === 'active' ? '' : s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${
                statusFilter === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s.replace(/_/g, ' ')}
            </button>
          ))}
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
          {assignedToMeFilter && (
            <button
              onClick={() => setFilter('assigned_to_me', '')}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
            >
              Assigned to me active ×
            </button>
          )}
          {slaBreachedFilter && (
            <button
              onClick={() => setFilter('sla_breached', '')}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
            >
              SLA breached ×
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {!isEss && selectedIds.length > 0 && (
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
            {INCIDENT_BULK_ACTIONS.map((action) => {
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
          emptyMessage={params.search ? `No incidents matching "${params.search}"` : 'No incidents found.'}
          onRowClick={(inc) => navigate(`/incidents/${inc.id}`, { state: { listParams: getListParams() } })}
          selectable={!isEss}
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
