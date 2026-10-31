/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { incidents as incidentsApi } from '@/api/client';
import type { Incident } from '@/api/client';
import Spinner from '@/components/Spinner';
import SearchBar from '@/components/SearchBar';
import DataTable from '@/components/DataTable';
import FilterPresetsBar from '@/components/FilterPresetsBar';
import { Button } from '@/components/ui/button';
import { useListParams } from '@/hooks/useListParams';
import { useResettingState } from '@/hooks/useSyncedState';
import { useCsvExport } from '@/hooks/useCsvExport';
import { useIncidentsList } from '@/hooks/queries';
import { useAuth } from '@/context/AuthContext';
import { isAgentRole } from '@/utils/roles';
import { useFieldLabel, usePriorityLabel, useStatusLabel } from '@/i18n/hooks';
import { buildColumns, type IncidentListLabels } from '../incidents/incidentColumns';
import { INCIDENT_CSV_HEADERS } from '../incidents/incidentListParams';
import IncidentBulkBar from '../incidents/IncidentBulkBar';
import { TODO_INCIDENT_STATUS_OPTIONS } from './todoListConfig';
import type { TodoScopeConfig } from './todoConfig';

export function IncidentsTab({ config }: { config: TodoScopeConfig }) {
  const tTodo = useTranslations('pages.todo');
  const tList = useTranslations('common.list');
  const tTable = useTranslations('common.table');
  const fieldLabel = useFieldLabel();
  const priorityLabel = usePriorityLabel();
  const statusLabel = useStatusLabel();
  const listLabels = useMemo<IncidentListLabels>(
    () => ({
      field: fieldLabel,
      priority: priorityLabel,
      emDash: tTable('emDash'),
      slaBreached: tList('breached'),
      unassigned: tTodo('unassigned'),
    }),
    [fieldLabel, priorityLabel, tTable, tList, tTodo],
  );

  const { user } = useAuth();
  const isAgent = isAgentRole(user?.roles);
  const { params, setSearch, setSort, setCols, setPage, setFilter, setColumnFilter, update } = useListParams({
    defaultCols: config.defaultCols,
    filterKeys: ['status'],
    storageKey: config.storageKey,
  });

  const navigate = useNavigate();
  const { exporting, exportCsv } = useCsvExport('my-groups-incidents');

  const statusFilter = params.filters.status || '';
  const emptyMessage = config.scope === 'me' ? tTodo('emptyMe') : tTodo('emptyGroup');

  const getListParams = useCallback((): Record<string, string> => {
    const lp: Record<string, string> = { ...config.incidentFilter };
    if (statusFilter) lp.status = statusFilter;
    if (params.search) lp.search = params.search;
    if (params.sort) {
      lp.sort_by = params.sort === 'sla' ? 'sla_due_at' : params.sort;
      lp.sort_dir = params.dir;
    }
    return lp;
  }, [config.incidentFilter, statusFilter, params.search, params.sort, params.dir]);

  const apiParams = useMemo(() => {
    const p = getListParams();
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (val) p[`cf.${col}`] = val;
    }
    return p;
  }, [getListParams, params.columnFilters]);

  const { data: listResult, isLoading: loading, isFetching } = useIncidentsList(apiParams, params.page);
  const data: Incident[] = listResult?.incidents ?? [];
  const pagination = listResult?.pagination ?? null;
  const selectionKey = `${params.page}|${isFetching}|${JSON.stringify(apiParams)}`;
  const [selectedIds, setSelectedIds] = useResettingState<string[]>([], selectionKey);

  const columns = useMemo(() => buildColumns(getListParams(), listLabels), [getListParams, listLabels]);

  const hasActiveFilter = !!params.search || statusFilter !== '' || Object.values(params.columnFilters).some(Boolean);

  return (
    <>
      {isAgent && (
        <FilterPresetsBar
          storageKey={config.presetsKey}
          current={{ search: params.search, status: statusFilter, columnFilters: params.columnFilters }}
          hasActiveFilter={hasActiveFilter}
          onApply={(preset) => update({ search: preset.search, filters: { status: preset.status }, columnFilters: preset.columnFilters, page: 1 })}
        />
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar
            value={params.search}
            onChange={setSearch}
            placeholder={tTodo('searchPlaceholder')}
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
              {s === '' ? tTodo('filters.allOpen') : statusLabel(s)}
            </button>
          ))}
          {isAgent && (
            <Button
              size="sm"
              variant="outline"
              disabled={exporting}
              onClick={() => exportCsv(INCIDENT_CSV_HEADERS, selectedIds, data, (page) =>
                incidentsApi.list(apiParams, page, 100).then((r) => ({ rows: r.incidents, pages: r.pagination.pages })),
              )}
            >
              {exporting ? tList('exporting') : tList('exportCsv')}
            </Button>
          )}
        </div>
      </div>

      {isAgent && <IncidentBulkBar selectedIds={selectedIds} onClear={() => setSelectedIds([])} />}

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
          emptyMessage={params.search ? tTodo('emptySearch', { query: params.search }) : emptyMessage}
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
