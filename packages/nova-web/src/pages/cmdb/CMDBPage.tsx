/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslations } from 'use-intl';
import { cmdb } from '../../api/client';
import type { CI, CIClass, Pagination } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import DataTable from '../../components/DataTable';
import { Button } from '../../components/ui/button';
import { useListParams } from '../../hooks/useListParams';
import { useUserPreferenceState } from '../../hooks/useUserPreferenceState';
import { hasConfigurationRole, isAgentRole } from '../../utils/roles';
import { useFieldLabel, useStatusLabel } from '@/i18n/hooks';
import { CMDB_BULK_ACTIONS } from './cmdbListConfig';
import { buildColumns, type CmdbListLabels } from './cmdbColumns';

const DEFAULT_COLS = ['name', 'class_display_name', 'status', 'environment', 'managed_by_name', 'assigned_to_name', 'supported_by_name', 'updated_at'];
const PRESETS_KEY = 'nova_filter_presets_cmdb';
const PAGE_SIZE_OPTIONS = [20, 50, 100];
const DEFAULT_PAGE_SIZE = 20;

interface FilterPreset {
  id: string;
  name: string;
  search: string;
  class_id: string;
  status: string;
  environment: string;
  is_active: string;
  columnFilters: Record<string, string>;
}

export default function CMDBPage() {
  const tCmdb = useTranslations('pages.cmdb');
  const tList = useTranslations('common.list');
  const tFilters = useTranslations('common.filters');
  const tActions = useTranslations('common.actions');
  const tMaster = useTranslations('common.masterData');
  const tTable = useTranslations('common.table');
  const tStates = useTranslations('common.states');
  const fieldLabel = useFieldLabel();
  const statusLabel = useStatusLabel();
  const listLabels = useMemo<CmdbListLabels>(
    () => ({ field: fieldLabel, emDash: tTable('emDash'), inactive: tStates('inactive') }),
    [fieldLabel, tTable, tStates],
  );

  const { params, setSearch, setSort, setCols, setPage, setFilter, setColumnFilter, update } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['class_id', 'status', 'environment', 'is_active'],
    storageKey: 'cmdb',
  });
  const [searchParams, setSearchParams] = useSearchParams();
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
  const statusFilter = params.filters.status || '';
  const environmentFilter = params.filters.environment || '';
  const isActiveFilter = params.filters.is_active || '';
  const cfKey = JSON.stringify(params.columnFilters);

  const pageSize = useMemo(() => {
    const raw = Number.parseInt(searchParams.get('limit') || String(DEFAULT_PAGE_SIZE), 10);
    return PAGE_SIZE_OPTIONS.includes(raw) ? raw : DEFAULT_PAGE_SIZE;
  }, [searchParams]);

  const setPageSize = useCallback((size: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (size === DEFAULT_PAGE_SIZE) next.delete('limit');
      else next.set('limit', String(size));
      next.set('page', '1');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    cmdb.classes().then((res) => setClasses(res.classes.filter((c) => c.is_active !== false)));
  }, []);

  useEffect(() => {
    setLoading(true);
    setSelectedIds([]);
    const apiParams: Record<string, string> = {};
    if (classFilter) apiParams.class_id = classFilter;
    if (statusFilter) apiParams.status = statusFilter;
    if (environmentFilter) apiParams.environment = environmentFilter;
    if (isActiveFilter === 'true' || isActiveFilter === 'false') apiParams.is_active = isActiveFilter;
    if (params.search) apiParams.search = params.search;
    if (params.sort) {
      apiParams.sort_by = params.sort;
      apiParams.sort_dir = params.dir;
    }
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (val) apiParams[`cf.${col}`] = val;
    }
    cmdb.items(apiParams, params.page, pageSize).then((res) => {
      setItems(res.items);
      setPagination(res.pagination);
      setLoading(false);
    }).catch(() => setLoading(false));
    // params.columnFilters is depended on by value via cfKey (stringified), not by identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.page, pageSize, classFilter, statusFilter, environmentFilter, isActiveFilter, params.search, params.sort, params.dir, cfKey]);

  const getListParams = useCallback((): Record<string, string> => {
    const lp: Record<string, string> = {};
    if (classFilter) lp.class_id = classFilter;
    if (statusFilter) lp.status = statusFilter;
    if (environmentFilter) lp.environment = environmentFilter;
    if (isActiveFilter) lp.is_active = isActiveFilter;
    if (params.search) lp.search = params.search;
    if (params.sort) {
      lp.sort_by = params.sort;
      lp.sort_dir = params.dir;
    }
    if (pageSize !== DEFAULT_PAGE_SIZE) lp.limit = String(pageSize);
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (val) lp[`cf.${col}`] = val;
    }
    return lp;
  }, [classFilter, statusFilter, environmentFilter, isActiveFilter, params.search, params.sort, params.dir, params.columnFilters, pageSize]);

  const columns = useMemo(() => buildColumns(listLabels), [listLabels]);
  const hasActiveFilter = !!params.search
    || classFilter !== ''
    || statusFilter !== ''
    || environmentFilter !== ''
    || isActiveFilter !== ''
    || Object.values(params.columnFilters).some(Boolean);
  const applyPreset = (preset: FilterPreset) => {
    update({
      search: preset.search,
      filters: {
        class_id: preset.class_id,
        status: preset.status || '',
        environment: preset.environment || '',
        is_active: preset.is_active || '',
      },
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
      status: statusFilter,
      environment: environmentFilter,
      is_active: isActiveFilter,
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
            if (statusFilter) apiParams.status = statusFilter;
            if (environmentFilter) apiParams.environment = environmentFilter;
            if (isActiveFilter === 'true' || isActiveFilter === 'false') apiParams.is_active = isActiveFilter;
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
      const headers = [
        'name', 'display_name', 'class_display_name', 'status', 'environment', 'is_active',
        'managed_by_name', 'assigned_to_name', 'supported_by_name', 'location',
        'external_id_1', 'external_id_2', 'updated_at', 'created_at',
      ];
      const getField = (row: CI, header: string): unknown => {
        switch (header) {
          case 'name': return row.name;
          case 'display_name': return row.display_name;
          case 'class_display_name': return row.class_display_name;
          case 'status': return row.status;
          case 'environment': return row.environment;
          case 'is_active': return row.is_active;
          case 'managed_by_name': return row.managed_by_name;
          case 'assigned_to_name': return row.assigned_to_name;
          case 'supported_by_name': return row.supported_by_name;
          case 'location': return row.location;
          case 'external_id_1': return row.external_id_1;
          case 'external_id_2': return row.external_id_2;
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

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
      active ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
    }`;

  return (
    <>
      <PageHeader
        title={tCmdb('title')}
        description={tCmdb('description')}
        action={canCreate ? (
          <button
            onClick={() => navigate('/cmdb/new')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + {tCmdb('newCiShort')}
          </button>
        ) : undefined}
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
                className="px-2 py-1 text-xs border border-indigo-300 rounded-full outline-hidden focus:ring-1 focus:ring-indigo-400 w-36"
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

      <div className="flex flex-col gap-3 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="w-full sm:w-80">
            <SearchBar
              value={params.search}
              onChange={setSearch}
              placeholder={tCmdb('searchPlaceholder')}
            />
          </div>
          {isAgent && (
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting}>
              {exporting ? tList('exporting') : tList('exportCsv')}
            </Button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={() => setFilter('class_id', '')} className={chip(!classFilter)}>
            {tCmdb('filters.allTypes')}
          </button>
          {classes.map((c) => (
            <button key={c.id} onClick={() => setFilter('class_id', c.id)} className={chip(classFilter === c.id)}>
              {c.display_name}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={() => setFilter('status', '')} className={chip(!statusFilter)}>
            {tCmdb('filters.allStatuses')}
          </button>
          {(['active', 'planned', 'maintenance', 'retired'] as const).map((s) => (
            <button key={s} onClick={() => setFilter('status', s)} className={chip(statusFilter === s)}>
              {s === 'active' ? tStates('active') : statusLabel(s)}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={() => setFilter('environment', '')} className={chip(!environmentFilter)}>
            {tCmdb('filters.allEnvironments')}
          </button>
          {(['production', 'staging', 'development', 'test'] as const).map((env) => (
            <button key={env} onClick={() => setFilter('environment', env)} className={chip(environmentFilter === env)}>
              {statusLabel(env)}
            </button>
          ))}
        </div>
        {canCreate && (
          <div className="flex gap-2 flex-wrap items-center">
            <button onClick={() => setFilter('is_active', '')} className={chip(!isActiveFilter)}>
              {tCmdb('filters.allActive')}
            </button>
            <button onClick={() => setFilter('is_active', 'true')} className={chip(isActiveFilter === 'true')}>
              {tCmdb('filters.activeOnly')}
            </button>
            <button onClick={() => setFilter('is_active', 'false')} className={chip(isActiveFilter === 'false')}>
              {tCmdb('filters.inactiveOnly')}
            </button>
          </div>
        )}
      </div>

      {isAgent && CMDB_BULK_ACTIONS.length > 0 && selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl mb-4 flex-wrap">
          <span className="text-sm font-semibold text-indigo-900">{tList('selected', { count: selectedIds.length })}</span>
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
                {tCmdb('bulk.openSelected')}
              </Button>
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
          data={items}
          visibleColumns={params.cols}
          onColumnsChange={setCols}
          sortKey={params.sort}
          sortDir={params.dir}
          onSort={setSort}
          columnFilters={params.columnFilters}
          onColumnFilter={setColumnFilter}
          emptyMessage={
            params.search
              ? tCmdb('emptySearch', { query: params.search })
              : tCmdb('empty')
          }
          onRowClick={(ci) => {
            navigate(`/cmdb/${ci.id}`, { state: { listParams: getListParams() } });
          }}
          selectable={isAgent}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          pagination={
            pagination
              ? {
                  page: params.page,
                  pages: Math.max(1, pagination.pages),
                  total: pagination.total,
                  onPageChange: setPage,
                  pageSize,
                  pageSizeOptions: PAGE_SIZE_OPTIONS,
                  onPageSizeChange: setPageSize,
                }
              : undefined
          }
        />
      )}
    </>
  );
}
