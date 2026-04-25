/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { problems as problemsApi } from '../../api/client';
import type { Pagination, Problem } from '../../api/client';
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
import { PROBLEM_BULK_ACTIONS, PROBLEM_PRIORITY_OPTIONS, PROBLEM_STATUS_OPTIONS } from './problemListConfig';

const DEFAULT_COLS = ['number', 'title', 'status', 'priority', 'assignment_group_name', 'incident_count', 'updated_at'];
const PRESETS_KEY = 'nova_filter_presets_problems';

interface FilterPreset {
  id: string;
  name: string;
  search: string;
  status: string;
  priority: string;
  columnFilters: Record<string, string>;
}

function buildColumns(listParams: Record<string, string>): DataColumnDef<Problem>[] {
  return [
    {
      key: 'number',
      label: 'Number',
      sortable: true,
      defaultVisible: true,
      render: (p) => (
        <Link
          to={`/problems/${p.id}`}
          state={{ listParams }}
          className="text-indigo-600 font-medium hover:text-indigo-800"
          onClick={(e) => e.stopPropagation()}
        >
          {p.number}
        </Link>
      ),
    },
    { key: 'title', label: 'Title', sortable: true, defaultVisible: true, render: (p) => p.title },
    { key: 'status', label: 'Status', sortable: true, defaultVisible: true, render: (p) => <Badge value={p.status} /> },
    { key: 'priority', label: 'Priority', sortable: true, defaultVisible: true, render: (p) => <span className="capitalize">{p.priority}</span> },
    { key: 'category', label: 'Category', sortable: true, defaultVisible: false, render: (p) => p.category || '—' },
    { key: 'assignment_group_name', label: 'Assignment Group', sortable: true, defaultVisible: true, render: (p) => p.assignment_group_name || '—' },
    { key: 'assigned_to_name', label: 'Assigned To', sortable: true, defaultVisible: false, render: (p) => p.assigned_to_name || '—' },
    { key: 'incident_count', label: '#Incidents', sortable: false, defaultVisible: true, render: (p) => String(p.incident_count || 0) },
    { key: 'open_incident_count', label: '#Open Incidents', sortable: false, defaultVisible: false, render: (p) => String(p.open_incident_count || 0) },
    { key: 'updated_at', label: 'Updated', sortable: true, defaultVisible: true, render: (p) => formatDate(p.updated_at) },
    { key: 'created_at', label: 'Created', sortable: true, defaultVisible: false, render: (p) => formatDate(p.created_at) },
  ];
}

export default function ProblemsPage() {
  const { user } = useAuth();
  const isAgent = isAgentRole(user?.roles);
  const { params, setSearch, setSort, setCols, setPage, setFilter, setColumnFilter, update } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['status', 'priority'],
    storageKey: 'problems',
  });
  const navigate = useNavigate();
  const [data, setData] = useState<Problem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [presets, setPresets] = useUserPreferenceState<FilterPreset[]>(
    `presets:${PRESETS_KEY}`,
    [],
    PRESETS_KEY,
  );
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [savePresetName, setSavePresetName] = useState('');

  const status = params.filters.status || 'all';
  const priority = params.filters.priority || 'all';
  const cfKey = JSON.stringify(params.columnFilters);

  useEffect(() => {
    setLoading(true);
    setSelectedIds([]);
    const apiParams: Record<string, string> = {};
    if (status !== 'all') apiParams.status = status;
    if (priority !== 'all') apiParams.priority = priority;
    if (params.search) apiParams.search = params.search;
    if (params.sort) {
      apiParams.sort_by = params.sort;
      apiParams.sort_dir = params.dir;
    }
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (val) apiParams[`cf.${col}`] = val;
    }
    problemsApi.list(apiParams, params.page, 20).then((res) => {
      setData(res.problems);
      setPagination(res.pagination);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [status, priority, params.search, params.sort, params.dir, params.page, cfKey, refreshKey]);

  const getListParams = useCallback((): Record<string, string> => {
    const lp: Record<string, string> = {};
    if (status !== 'all') lp.status = status;
    if (priority !== 'all') lp.priority = priority;
    if (params.search) lp.search = params.search;
    if (params.sort) {
      lp.sort_by = params.sort;
      lp.sort_dir = params.dir;
    }
    return lp;
  }, [status, priority, params.search, params.sort, params.dir]);

  const columns = useMemo(() => buildColumns(getListParams()), [getListParams]);
  const hasActiveFilter = !!params.search || status !== 'all' || priority !== 'all' || Object.values(params.columnFilters).some(Boolean);
  const applyPreset = (preset: FilterPreset) => {
    update({
      search: preset.search,
      filters: { status: preset.status, priority: preset.priority },
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
      status,
      priority,
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

  const handleBulkClose = async () => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      await Promise.all(selectedIds.map((id) => problemsApi.update(id, { status: 'closed' })));
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
      const allRows = selectedIds.length > 0
        ? data.filter((row) => selectedIds.includes(row.id))
        : await (async () => {
            const apiParams: Record<string, string> = {};
            if (status !== 'all') apiParams.status = status;
            if (priority !== 'all') apiParams.priority = priority;
            if (params.search) apiParams.search = params.search;
            if (params.sort) {
              apiParams.sort_by = params.sort;
              apiParams.sort_dir = params.dir;
            }
            for (const [col, val] of Object.entries(params.columnFilters)) {
              if (val) apiParams[`cf.${col}`] = val;
            }
            const firstPage = await problemsApi.list(apiParams, 1, 100);
            const rows = [...firstPage.problems];
            for (let page = 2; page <= firstPage.pagination.pages; page += 1) {
              const nextPage = await problemsApi.list(apiParams, page, 100);
              rows.push(...nextPage.problems);
            }
            return rows;
          })();
      const headers = ['number', 'title', 'status', 'priority', 'assignment_group_name', 'assigned_to_name', 'incident_count', 'open_incident_count', 'updated_at', 'created_at'];
      const getField = (row: Problem, header: string): unknown => {
        switch (header) {
          case 'number': return row.number;
          case 'title': return row.title;
          case 'status': return row.status;
          case 'priority': return row.priority;
          case 'assignment_group_name': return row.assignment_group_name;
          case 'assigned_to_name': return row.assigned_to_name;
          case 'incident_count': return row.incident_count;
          case 'open_incident_count': return row.open_incident_count;
          case 'updated_at': return row.updated_at;
          case 'created_at': return row.created_at;
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
      a.download = selectedIds.length > 0 ? `problems-selected-${ts}.csv` : `problems-${ts}.csv`;
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
      <PageHeader title="Problems" description="Root cause investigations and known-error tracking." action={
        <Link to="/problems/new" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          + New Problem
        </Link>
      } />
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
          <SearchBar value={params.search} onChange={setSearch} placeholder="Search by number, title, description..." />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {PROBLEM_STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter('status', s === 'all' ? '' : s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${status === s ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
            >
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {PROBLEM_PRIORITY_OPTIONS.map((p) => (
            <button
              key={p}
              onClick={() => setFilter('priority', p === 'all' ? '' : p)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${priority === p ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
            >
              {p}
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
            {PROBLEM_BULK_ACTIONS.map((action) => (
              confirmClose ? (
                <span key={action.id} className="inline-flex items-center gap-2">
                  <span className="text-xs text-gray-600">Close {selectedIds.length} problems?</span>
                  <Button size="sm" variant="warning" disabled={bulkLoading} onClick={handleBulkClose}>Confirm</Button>
                  <button onClick={() => setConfirmClose(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                </span>
              ) : (
                <Button key={action.id} size="sm" variant={action.variant} onClick={() => setConfirmClose(true)}>
                  {action.label}
                </Button>
              )
            ))}
          </div>
          <button onClick={() => { setSelectedIds([]); setConfirmClose(false); }} className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-medium">
            Clear selection
          </button>
        </div>
      )}
      {loading ? <Spinner /> : (
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
          emptyMessage={params.search ? `No problems matching "${params.search}"` : 'No problems found.'}
          onRowClick={(p) => navigate(`/problems/${p.id}`, { state: { listParams: getListParams() } })}
          selectable={isAgent}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          pagination={pagination && pagination.pages > 1 ? {
            page: params.page,
            pages: pagination.pages,
            total: pagination.total,
            onPageChange: setPage,
          } : undefined}
        />
      )}
    </>
  );
}
