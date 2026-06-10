/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { incidents as incidentsApi } from '../../api/client';
import type { Incident } from '../../api/client';
import {
  useIncidentsList,
  useIncidentAssignmentGroups,
  useInvalidateIncidents,
} from '@/hooks/queries';
import MajorIncidentBanner from '../../components/MajorIncidentBanner';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import DataTable from '../../components/DataTable';
import { Button } from '../../components/ui/button';
import { useListParams } from '../../hooks/useListParams';
import { useUserPreferenceState } from '../../hooks/useUserPreferenceState';
import { useAuth } from '../../context/AuthContext';
import { isAgentRole } from '../../utils/roles';
import { INCIDENT_BULK_ACTIONS, INCIDENT_STATUS_OPTIONS } from './incidentListConfig';
import { buildColumns, type IncidentListLabels } from './incidentColumns';
import {
  createIncidentListParams,
  type FilterPreset,
  PRESETS_KEY,
  DEFAULT_COLS,
} from './incidentListParams';
import { exportIncidentsCsv } from './incidentExport';
import { useFieldLabel, usePriorityLabel, useStatusLabel } from '@/i18n/hooks';
import { useTranslations } from 'use-intl';

export default function IncidentsPage() {
  const tIncidents = useTranslations('pages.incidents');
  const tList = useTranslations('common.list');
  const tFilters = useTranslations('common.filters');
  const tActions = useTranslations('common.actions');
  const tMaster = useTranslations('common.masterData');
  const fieldLabel = useFieldLabel();
  const priorityLabel = usePriorityLabel();
  const statusLabel = useStatusLabel();
  const tTable = useTranslations('common.table');
  const listLabels = useMemo<IncidentListLabels>(
    () => ({
      field: fieldLabel,
      priority: priorityLabel,
      status: statusLabel,
      emDash: tTable('emDash'),
      slaBreached: tList('breached'),
    }),
    [fieldLabel, priorityLabel, statusLabel, tTable, tList],
  );
  const { user } = useAuth();
  const isEss = !isAgentRole(user?.roles);

  const { params, setSearch, setSort, setCols, setPage, setFilter, setColumnFilter, update } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['status', 'assigned_to_me', 'sla_breached'],
    storageKey: 'incidents',
  });

  const navigate = useNavigate();
  const invalidateIncidents = useInvalidateIncidents();
  const [searchParams, setSearchParams] = useSearchParams();

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkGroupId, setBulkGroupId] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

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
  const { data: groups = [] } = useIncidentAssignmentGroups();

  useEffect(() => {
    setSelectedIds([]);
  }, [params.page, apiParams, isFetching]);

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

  // ── Bulk actions ──
  const handleBulkAssign = async () => {
    if (!bulkGroupId || selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      await incidentsApi.bulkUpdate(selectedIds, 'assign_group', bulkGroupId);
      setSelectedIds([]);
      setBulkGroupId('');
      invalidateIncidents();
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
      invalidateIncidents();
    } finally {
      setBulkLoading(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await exportIncidentsCsv({
        selectedIds,
        data,
        statusFilter,
        assignedToMe: assignedToMeFilter,
        slaBreached: slaBreachedFilter,
        search: params.search,
        sort: params.sort,
        dir: params.dir,
        columnFilters: params.columnFilters,
        exportFailedMessage: tIncidents('exportFailed'),
      });
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

      {/* Saved filter presets */}
      {!isEss && (presets.length > 0 || hasActiveFilter) && (
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
                className="px-2 py-1 text-xs border border-indigo-300 rounded-full outline-none focus:ring-1 focus:ring-indigo-400 w-36"
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
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting}>
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

      {/* Bulk action bar */}
      {!isEss && selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl mb-4 flex-wrap">
          <span className="text-sm font-semibold text-indigo-900">{tList('selected', { count: selectedIds.length })}</span>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={bulkGroupId}
              onChange={(e) => setBulkGroupId(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">{tMaster('assignToGroup')}</option>
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
                    {tIncidents('bulk.assignGroup')}
                  </Button>
                );
              }
              if (action.id === 'close') {
                return confirmClose ? (
                  <span key={action.id} className="inline-flex items-center gap-2">
                    <span className="text-xs text-gray-600">{tIncidents('bulk.confirmClose', { count: selectedIds.length })}</span>
                    <Button size="sm" variant="warning" disabled={bulkLoading} onClick={handleBulkClose}>{tMaster('confirm')}</Button>
                    <button onClick={() => setConfirmClose(false)} className="text-xs text-gray-500 hover:text-gray-700">{tActions('cancel')}</button>
                  </span>
                ) : (
                  <Button key={action.id} size="sm" variant={action.variant} onClick={() => setConfirmClose(true)}>
                    {tIncidents('bulk.closeIncidents')}
                  </Button>
                );
              }
              return null;
            })}
          </div>
          <button onClick={() => { setSelectedIds([]); setConfirmClose(false); setBulkGroupId(''); }} className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-medium">
            {tMaster('clearSelection')}
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
