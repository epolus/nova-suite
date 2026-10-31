/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { incidents as incidentsApi } from '../../api/client';
import type { Incident } from '../../api/client';
import { useIncidentsList } from '@/hooks/queries';
import MajorIncidentBanner from '../../components/MajorIncidentBanner';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import DataTable from '../../components/DataTable';
import { Button } from '../../components/ui/button';
import { useListParams } from '../../hooks/useListParams';
import { useResettingState } from '../../hooks/useSyncedState';
import { useCsvExport } from '@/hooks/useCsvExport';
import FilterPresetsBar from '@/components/FilterPresetsBar';
import { useAuth } from '../../context/AuthContext';
import { isAgentRole } from '../../utils/roles';
import { buildColumns, type IncidentListLabels } from './incidentColumns';
import {
  createIncidentListParams,
  INCIDENT_CSV_HEADERS,
  INCIDENT_STATUS_OPTIONS,
  PRESETS_KEY,
  DEFAULT_COLS,
} from './incidentListParams';
import IncidentBulkBar from './IncidentBulkBar';
import { useFieldLabel, usePriorityLabel, useStatusLabel } from '@/i18n/hooks';
import { useTranslations } from 'use-intl';

export default function IncidentsPage() {
  const tIncidents = useTranslations('pages.incidents');
  const tList = useTranslations('common.list');
  const fieldLabel = useFieldLabel();
  const priorityLabel = usePriorityLabel();
  const statusLabel = useStatusLabel();
  const tTable = useTranslations('common.table');
  const listLabels = useMemo<IncidentListLabels>(
    () => ({
      field: fieldLabel,
      priority: priorityLabel,
      emDash: tTable('emDash'),
      slaBreached: tList('breached'),
    }),
    [fieldLabel, priorityLabel, tTable, tList],
  );
  const { user } = useAuth();
  const isEss = !isAgentRole(user?.roles);

  const { params, setSearch, setSort, setCols, setPage, setFilter, setColumnFilter, update } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['status', 'assigned_to_me', 'sla_breached'],
    storageKey: 'incidents',
  });

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { exporting, exportCsv } = useCsvExport('incidents');

  const rawStatusFilter = params.filters.status || '';
  const statusFilter = rawStatusFilter || 'active';
  const assignedToMeFilter = params.filters.assigned_to_me === 'true';
  const slaBreachedFilter = params.filters.sla_breached === 'true';
  const apiParams = useMemo(
    () =>
      createIncidentListParams({
        statusFilter,
        assignedToMe: assignedToMeFilter,
        slaBreached: slaBreachedFilter,
        search: params.search,
        sort: params.sort,
        dir: params.dir,
        columnFilters: params.columnFilters,
      }),
    [
      statusFilter,
      assignedToMeFilter,
      slaBreachedFilter,
      params.search,
      params.sort,
      params.dir,
      params.columnFilters,
    ],
  );

  const { data: listResult, isLoading: loading, isFetching } = useIncidentsList(apiParams, params.page);
  const data: Incident[] = listResult?.incidents ?? [];
  const pagination = listResult?.pagination ?? null;
  const selectionKey = `${params.page}|${isFetching}|${JSON.stringify(apiParams)}`;
  const [selectedIds, setSelectedIds] = useResettingState<string[]>([], selectionKey);

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

  const hasActiveFilter = !!params.search || statusFilter !== 'active' || Object.values(params.columnFilters).some(Boolean);

  const columns = useMemo(() => buildColumns(apiParams, listLabels), [apiParams, listLabels]);

  return (
    <>
      {!isEss && <MajorIncidentBanner />}
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

      {!isEss && (
        <FilterPresetsBar
          storageKey={PRESETS_KEY}
          current={{ search: params.search, status: rawStatusFilter, columnFilters: params.columnFilters }}
          hasActiveFilter={hasActiveFilter}
          onApply={(preset) => update({ search: preset.search, filters: { status: preset.status }, columnFilters: preset.columnFilters, page: 1 })}
        />
      )}

      {/* Search + Status filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar
            value={params.search}
            onChange={setSearch}
            placeholder={tIncidents('searchPlaceholder')}
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
              {statusLabel(s)}
            </button>
          ))}
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
          {assignedToMeFilter && (
            <button
              onClick={() => setFilter('assigned_to_me', '')}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
            >
              {tIncidents('filters.assignedToMeActive')}
            </button>
          )}
          {slaBreachedFilter && (
            <button
              onClick={() => setFilter('sla_breached', '')}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
            >
              {tIncidents('filters.slaBreachedActive')}
            </button>
          )}
        </div>
      </div>

      {!isEss && <IncidentBulkBar selectedIds={selectedIds} onClear={() => setSelectedIds([])} />}

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
              ? tIncidents('emptySearch', { query: params.search })
              : tIncidents('empty')
          }
          onRowClick={(inc) => navigate(`/incidents/${inc.id}`, { state: { listParams: apiParams } })}
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
