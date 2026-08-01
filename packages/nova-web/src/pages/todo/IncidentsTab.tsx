/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { incidents as incidentsApi } from '@/api/client';
import type { Incident } from '@/api/client';
import Spinner from '@/components/Spinner';
import SearchBar from '@/components/SearchBar';
import DataTable from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { useListParams } from '@/hooks/useListParams';
import { useUserPreferenceState } from '@/hooks/useUserPreferenceState';
import { useIncidentsList, useIncidentAssignmentGroups, useInvalidateIncidents } from '@/hooks/queries';
import { useAuth } from '@/context/AuthContext';
import { isAgentRole } from '@/utils/roles';
import { useFieldLabel, usePriorityLabel, useStatusLabel } from '@/i18n/hooks';
import { TODO_BULK_ACTIONS, TODO_INCIDENT_STATUS_OPTIONS } from './todoListConfig';
import type { TodoScopeConfig } from './todoConfig';
import { buildColumns, type TodoListLabels } from './incidentColumns';

interface FilterPreset {
  id: string;
  name: string;
  search: string;
  status: string;
  columnFilters: Record<string, string>;
}

export function IncidentsTab({ config }: { config: TodoScopeConfig }) {
  const tTodo = useTranslations('pages.todo');
  const tList = useTranslations('common.list');
  const tFilters = useTranslations('common.filters');
  const tActions = useTranslations('common.actions');
  const tMaster = useTranslations('common.masterData');
  const tTable = useTranslations('common.table');
  const fieldLabel = useFieldLabel();
  const priorityLabel = usePriorityLabel();
  const statusLabel = useStatusLabel();
  const listLabels = useMemo<TodoListLabels>(
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
  const invalidateIncidents = useInvalidateIncidents();
  const { params, setSearch, setSort, setCols, setPage, setFilter, setColumnFilter, update } = useListParams({
    defaultCols: config.defaultCols,
    filterKeys: ['status'],
    storageKey: config.storageKey,
  });

  const [exporting, setExporting] = useState(false);
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkGroupId, setBulkGroupId] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [presets, setPresets] = useUserPreferenceState<FilterPreset[]>(
    `presets:${config.presetsKey}`,
    [],
    config.presetsKey,
  );
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [savePresetName, setSavePresetName] = useState('');

  const rawStatusFilter = params.filters.status || '';
  const statusFilter = rawStatusFilter;
  const emptyMessage = config.scope === 'me' ? tTodo('emptyMe') : tTodo('emptyGroup');

  const apiParams = useMemo(() => {
    const p: Record<string, string> = { ...config.incidentFilter };
    if (statusFilter) p.status = statusFilter;
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (val) p[`cf.${col}`] = val;
    }
    if (params.search) p.search = params.search;
    if (params.sort) {
      p.sort_by = params.sort === 'sla' ? 'sla_due_at' : params.sort;
      p.sort_dir = params.dir;
    }
    return p;
  }, [config.incidentFilter, statusFilter, params.columnFilters, params.search, params.sort, params.dir]);

  const { data: listResult, isLoading: loading, isFetching } = useIncidentsList(apiParams, params.page);
  const data: Incident[] = listResult?.incidents ?? [];
  const pagination = listResult?.pagination ?? null;
  const { data: groups = [] } = useIncidentAssignmentGroups();

  useEffect(() => {
    setSelectedIds([]);
  }, [params.page, apiParams, isFetching]);

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

  const columns = useMemo(() => buildColumns(getListParams(), listLabels), [getListParams, listLabels]);

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
            const apiParams: Record<string, string> = { ...config.incidentFilter };
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
      const headers = ['number', 'title', 'status', 'priority', 'assigned_to_name', 'assignment_group_name', 'sla_due_at', 'sla_breached', 'updated_at'];
      const getField = (incident: Incident, header: string): unknown => {
        switch (header) {
          case 'number': return incident.number;
          case 'title': return incident.title;
          case 'status': return incident.status;
          case 'priority': return incident.priority;
          case 'assigned_to_name': return incident.assigned_to_name;
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
      a.download = selectedIds.length > 0 ? `my-groups-incidents-selected-${ts}.csv` : `my-groups-incidents-${ts}.csv`;
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
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting}>
              {exporting ? tList('exporting') : tList('exportCsv')}
            </Button>
          )}
        </div>
      </div>

      {isAgent && selectedIds.length > 0 && (
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
                    {tTodo('bulk.assignGroup')}
                  </Button>
                );
              }
              if (action.id === 'close') {
                return confirmClose ? (
                  <span key={action.id} className="inline-flex items-center gap-2">
                    <span className="text-xs text-gray-600">{tTodo('bulk.confirmClose', { count: selectedIds.length })}</span>
                    <Button size="sm" variant="warning" disabled={bulkLoading} onClick={handleBulkClose}>{tMaster('confirm')}</Button>
                    <button onClick={() => setConfirmClose(false)} className="text-xs text-gray-500 hover:text-gray-700">{tActions('cancel')}</button>
                  </span>
                ) : (
                  <Button key={action.id} size="sm" variant={action.variant} onClick={() => setConfirmClose(true)}>
                    {tTodo('bulk.closeIncidents')}
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
