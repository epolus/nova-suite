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
import { useResettingState } from '../../hooks/useSyncedState';
import { useCsvExport } from '@/hooks/useCsvExport';
import FilterPresetsBar from '@/components/FilterPresetsBar';
import { hasConfigurationRole, isAgentRole } from '../../utils/roles';
import { useFieldLabel, useStatusLabel } from '@/i18n/hooks';
import { CMDB_BULK_ACTIONS } from './cmdbListConfig';
import { buildColumns, type CmdbListLabels } from './cmdbColumns';
import { CmdbFilterChips } from './CmdbFilterChips';

const DEFAULT_COLS = ['name', 'class_display_name', 'status', 'environment', 'managed_by_name', 'assigned_to_name', 'supported_by_name', 'updated_at'];
const PRESETS_KEY = 'nova_filter_presets_cmdb';
const CI_CSV_HEADERS: (keyof CI & string)[] = [
  'name', 'display_name', 'class_display_name', 'status', 'environment', 'is_active',
  'managed_by_name', 'assigned_to_name', 'supported_by_name', 'location',
  'external_id_1', 'external_id_2', 'updated_at', 'created_at',
];
const PAGE_SIZE_OPTIONS = [20, 50, 100];
const DEFAULT_PAGE_SIZE = 20;

export default function CMDBPage() {
  const tCmdb = useTranslations('pages.cmdb');
  const tList = useTranslations('common.list');
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
  const { exporting, exportCsv } = useCsvExport('cmdb');
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

  const listKey = `${params.page}|${pageSize}|${classFilter}|${statusFilter}|${environmentFilter}|${isActiveFilter}|${params.search}|${params.sort}|${params.dir}|${cfKey}`;
  const [selectedIds, setSelectedIds] = useResettingState<string[]>([], listKey);
  const [prevListKey, setPrevListKey] = useState(listKey);
  if (listKey !== prevListKey) {
    setPrevListKey(listKey);
    setLoading(true);
  }

  const buildApiParams = () => {
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
    return apiParams;
  };

  useEffect(() => {
    cmdb.items(buildApiParams(), params.page, pageSize).then((res) => {
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
      {isAgent && (
        <FilterPresetsBar
          storageKey={PRESETS_KEY}
          current={{
            search: params.search,
            class_id: classFilter,
            status: statusFilter,
            environment: environmentFilter,
            is_active: isActiveFilter,
            columnFilters: params.columnFilters,
          }}
          hasActiveFilter={hasActiveFilter}
          onApply={(preset) => update({
            search: preset.search,
            filters: {
              class_id: preset.class_id,
              status: preset.status || '',
              environment: preset.environment || '',
              is_active: preset.is_active || '',
            },
            columnFilters: preset.columnFilters,
            page: 1,
          })}
        />
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
            <Button
              size="sm"
              variant="outline"
              disabled={exporting}
              onClick={() => exportCsv(CI_CSV_HEADERS, selectedIds, items, (page) =>
                cmdb.items(buildApiParams(), page, 100).then((r) => ({ rows: r.items, pages: r.pagination.pages })),
              )}
            >
              {exporting ? tList('exporting') : tList('exportCsv')}
            </Button>
          )}
        </div>
        <CmdbFilterChips
          classes={classes}
          classFilter={classFilter}
          statusFilter={statusFilter}
          environmentFilter={environmentFilter}
          isActiveFilter={isActiveFilter}
          canCreate={canCreate}
          setFilter={setFilter}
          statusLabel={statusLabel}
        />
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
