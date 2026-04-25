/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cmdb } from '../../api/client';
import type { CI, CIClass, Pagination } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import DataTable, { type DataColumnDef } from '../../components/DataTable';
import { Button } from '../../components/ui/button';
import { useListParams } from '../../hooks/useListParams';
import { useUserPreferenceState } from '../../hooks/useUserPreferenceState';
import { formatDate } from '../../utils/dateTime';
import { hasConfigurationRole, isAgentRole } from '../../utils/roles';
import { CMDB_BULK_ACTIONS } from './cmdbListConfig';

const DEFAULT_COLS = ['name', 'class_display_name', 'status', 'environment', 'managed_by_name', 'assigned_to_name', 'supported_by_name', 'updated_at'];
const PRESETS_KEY = 'nova_filter_presets_cmdb';

interface FilterPreset {
  id: string;
  name: string;
  search: string;
  class_id: string;
  columnFilters: Record<string, string>;
}

const ALL_COLUMNS: DataColumnDef<CI>[] = [
  {
    key: 'name',
    label: 'Name',
    sortable: true,
    defaultVisible: true,
    render: (ci) => (
      <div>
        <Link
          to={`/cmdb/${ci.id}`}
          className="text-indigo-600 font-medium hover:text-indigo-800"
          onClick={(e) => e.stopPropagation()}
        >
          {ci.display_name || ci.name}
        </Link>
        <p className="text-xs text-gray-400">{ci.name}</p>
      </div>
    ),
  },
  {
    key: 'class_display_name',
    label: 'Class',
    sortable: true,
    defaultVisible: true,
    render: (ci) => <span className="text-gray-700">{ci.class_display_name}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    sortable: true,
    defaultVisible: true,
    render: (ci) => <Badge value={ci.status} />,
  },
  {
    key: 'environment',
    label: 'Environment',
    sortable: true,
    defaultVisible: true,
    render: (ci) => <Badge value={ci.environment} />,
  },
  {
    key: 'managed_by_name',
    label: 'Managed By',
    sortable: true,
    defaultVisible: true,
    render: (ci) => <span className="text-gray-500">{ci.managed_by_name || '—'}</span>,
  },
  {
    key: 'assigned_to_name',
    label: 'Assigned To',
    sortable: true,
    defaultVisible: true,
    render: (ci) => <span className="text-gray-500">{ci.assigned_to_name || '—'}</span>,
  },
  {
    key: 'supported_by_name',
    label: 'Supported By',
    sortable: true,
    defaultVisible: true,
    render: (ci) => <span className="text-gray-500">{ci.supported_by_name || '—'}</span>,
  },
  {
    key: 'location',
    label: 'Location',
    sortable: true,
    defaultVisible: false,
    render: (ci) => <span className="text-gray-500">{ci.location || '—'}</span>,
  },
  {
    key: 'created_at',
    label: 'Created',
    sortable: true,
    defaultVisible: false,
    render: (ci) => (
      <span className="text-gray-500 text-xs">{formatDate(ci.created_at)}</span>
    ),
  },
  {
    key: 'updated_at',
    label: 'Updated',
    sortable: true,
    defaultVisible: true,
    render: (ci) => (
      <span className="text-gray-500 text-xs">{formatDate(ci.updated_at)}</span>
    ),
  },
];

export default function CMDBPage() {
  const { params, setSearch, setSort, setCols, setPage, setFilter, setColumnFilter, update } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['class_id'],
    storageKey: 'cmdb',
  });
  const { user } = useAuth();

  const [classes, setClasses] = useState<CIClass[]>([]);
  const [items, setItems] = useState<CI[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [presets, setPresets] = useUserPreferenceState<FilterPreset[]>(
    `presets:${PRESETS_KEY}`,
    [],
    PRESETS_KEY,
  );
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [savePresetName, setSavePresetName] = useState('');
  const navigate = useNavigate();

  const isAgent = isAgentRole(user?.roles);
  const canCreate = hasConfigurationRole(user?.roles);

  const classFilter = params.filters.class_id || '';
  const cfKey = JSON.stringify(params.columnFilters);

  useEffect(() => {
    cmdb.classes().then((res) => setClasses(res.classes));
  }, []);

  useEffect(() => {
    setLoading(true);
    setSelectedIds([]);
    const apiParams: Record<string, string> = {};
    if (classFilter) apiParams.class_id = classFilter;
    if (params.search) apiParams.search = params.search;
    if (params.sort) {
      apiParams.sort_by = params.sort;
      apiParams.sort_dir = params.dir;
    }
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (val) apiParams[`cf.${col}`] = val;
    }
    cmdb.items(apiParams, params.page, 20).then((res) => {
      setItems(res.items);
      setPagination(res.pagination);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [params.page, classFilter, params.search, params.sort, params.dir, cfKey]);

  const getListParams = useCallback((): Record<string, string> => {
    const lp: Record<string, string> = {};
    if (classFilter) lp.class_id = classFilter;
    if (params.search) lp.search = params.search;
    if (params.sort) {
      lp.sort_by = params.sort;
      lp.sort_dir = params.dir;
    }
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (val) lp[`cf.${col}`] = val;
    }
    return lp;
  }, [classFilter, params.search, params.sort, params.dir, params.columnFilters]);

  const columns = useMemo(() => ALL_COLUMNS, []);
  const hasActiveFilter = !!params.search || classFilter !== '' || Object.values(params.columnFilters).some(Boolean);
  const applyPreset = (preset: FilterPreset) => {
    update({
      search: preset.search,
      filters: { class_id: preset.class_id },
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
      class_id: classFilter,
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
        ? items.filter((row) => selectedIds.includes(row.id))
        : await (async () => {
            const apiParams: Record<string, string> = {};
            if (classFilter) apiParams.class_id = classFilter;
            if (params.search) apiParams.search = params.search;
            if (params.sort) {
              apiParams.sort_by = params.sort;
              apiParams.sort_dir = params.dir;
            }
            for (const [col, val] of Object.entries(params.columnFilters)) {
              if (val) apiParams[`cf.${col}`] = val;
            }
            const firstPage = await cmdb.items(apiParams, 1, 100);
            const rows = [...firstPage.items];
            for (let page = 2; page <= firstPage.pagination.pages; page += 1) {
              const nextPage = await cmdb.items(apiParams, page, 100);
              rows.push(...nextPage.items);
            }
            return rows;
          })();
      const headers = ['name', 'display_name', 'class_display_name', 'status', 'environment', 'managed_by_name', 'assigned_to_name', 'supported_by_name', 'location', 'updated_at', 'created_at'];
      const getField = (row: CI, header: string): unknown => {
        switch (header) {
          case 'name': return row.name;
          case 'display_name': return row.display_name;
          case 'class_display_name': return row.class_display_name;
          case 'status': return row.status;
          case 'environment': return row.environment;
          case 'managed_by_name': return row.managed_by_name;
          case 'assigned_to_name': return row.assigned_to_name;
          case 'supported_by_name': return row.supported_by_name;
          case 'location': return row.location;
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
      a.download = selectedIds.length > 0 ? `cmdb-selected-${ts}.csv` : `cmdb-${ts}.csv`;
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
      <PageHeader
        title="Configuration Management Database"
        description="Manage your infrastructure inventory."
        action={canCreate ? (
          <button
            onClick={() => navigate('/cmdb/new')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + New CI
          </button>
        ) : undefined}
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

      {/* Search + Class filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="w-full sm:w-80">
          <SearchBar
            value={params.search}
            onChange={setSearch}
            placeholder="Search CIs by name..."
          />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={() => setFilter('class_id', '')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              !classFilter ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            All Types
          </button>
          {classes.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter('class_id', c.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                classFilter === c.id ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {c.display_name}
            </button>
          ))}
          {isAgent && (
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Export CSV'}
            </Button>
          )}
        </div>
      </div>

      {isAgent && CMDB_BULK_ACTIONS.length > 0 && selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl mb-4 flex-wrap">
          <span className="text-sm font-semibold text-indigo-900">{selectedIds.length} selected</span>
          <div className="flex items-center gap-2 flex-wrap">
            {CMDB_BULK_ACTIONS.map((action) => (
              <Button
                key={action.id}
                size="sm"
                variant={action.variant}
                onClick={() => {
                  if (action.id === 'open_selected') {
                    const selectedRows = items.filter((row) => selectedIds.includes(row.id));
                    selectedRows.forEach((row) => window.open(`/cmdb/${row.id}`, '_blank', 'noopener,noreferrer'));
                  }
                }}
              >
                {action.label}
              </Button>
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
          data={items}
          visibleColumns={params.cols}
          onColumnsChange={setCols}
          sortKey={params.sort}
          sortDir={params.dir}
          onSort={setSort}
          columnFilters={params.columnFilters}
          onColumnFilter={setColumnFilter}
          emptyMessage={params.search ? `No CIs matching "${params.search}"` : 'No configuration items found.'}
          onRowClick={(ci) => {
            navigate(`/cmdb/${ci.id}`, { state: { listParams: getListParams() } });
          }}
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
