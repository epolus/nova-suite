/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { AllCatalogTask } from '../../../api/client';
import { useUserPreferenceState } from '../../../hooks/useUserPreferenceState';
import {
  ALL_TASKS_SAVED_VIEWS_KEY,
  ALL_TASKS_SAVED_VIEWS_SCOPE,
  buildServiceItemRows,
  type AllTasksSort,
  type CatalogTasksListLocationState,
  type SavedAllTasksView,
} from './types';
import AllTasksFilters from './AllTasksFilters';
import AllTasksTableRow from './AllTasksTableRow';

export default function AllTasksView({ tasks }: { tasks: AllCatalogTask[] }) {
  const t = useTranslations('pages.admin.catalogTasks');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [groupFilter, setGroupFilter] = useState(() => searchParams.get('group') || '');
  const [typeFilter, setTypeFilter] = useState(() => searchParams.get('type') || '');
  const [automationFilter, setAutomationFilter] = useState<'all' | 'with' | 'without'>(
    () => {
      const value = searchParams.get('automation');
      return value === 'with' || value === 'without' ? value : 'all';
    },
  );
  const [itemActivityFilter, setItemActivityFilter] = useState<'all' | 'active' | 'inactive'>(
    () => {
      const value = searchParams.get('itemActivity');
      return value === 'active' || value === 'inactive' ? value : 'all';
    },
  );
  const [sortBy, setSortBy] = useState<AllTasksSort>(
    () => {
      const value = searchParams.get('sort');
      return value === 'nameAsc' || value === 'automationFirst' ? value : 'taskCountDesc';
    },
  );
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [savedViews, setSavedViews] = useUserPreferenceState<SavedAllTasksView[]>(
    ALL_TASKS_SAVED_VIEWS_SCOPE,
    [],
    ALL_TASKS_SAVED_VIEWS_KEY,
  );
  const [savedViewName, setSavedViewName] = useState('');
  const [selectedSavedViewId, setSelectedSavedViewId] = useState('');

  const syncParams = useCallback((next: {
    search: string;
    groupFilter: string;
    typeFilter: string;
    automationFilter: 'all' | 'with' | 'without';
    itemActivityFilter: 'all' | 'active' | 'inactive';
    sortBy: AllTasksSort;
  }) => {
    const params = new URLSearchParams(searchParams);
    if (next.search.trim()) params.set('q', next.search.trim());
    else params.delete('q');

    if (next.groupFilter) params.set('group', next.groupFilter);
    else params.delete('group');

    if (next.typeFilter) params.set('type', next.typeFilter);
    else params.delete('type');

    if (next.automationFilter !== 'all') params.set('automation', next.automationFilter);
    else params.delete('automation');

    if (next.itemActivityFilter !== 'all') params.set('itemActivity', next.itemActivityFilter);
    else params.delete('itemActivity');

    if (next.sortBy !== 'taskCountDesc') params.set('sort', next.sortBy);
    else params.delete('sort');

    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const currentFilterSet = useMemo(
    () => ({ search, groupFilter, typeFilter, automationFilter, itemActivityFilter, sortBy }),
    [search, groupFilter, typeFilter, automationFilter, itemActivityFilter, sortBy],
  );

  const applyFilters = useCallback((next: SavedAllTasksView['filters']) => {
    setSearch(next.search);
    setGroupFilter(next.groupFilter);
    setTypeFilter(next.typeFilter);
    setAutomationFilter(next.automationFilter);
    setItemActivityFilter(next.itemActivityFilter);
    setSortBy(next.sortBy);
    syncParams(next);
  }, [syncParams]);

  const saveCurrentView = () => {
    const name = savedViewName.trim();
    if (!name) return;
    const view: SavedAllTasksView = {
      id: `${Date.now()}`,
      name,
      filters: currentFilterSet,
    };
    setSavedViews((prev) => [view, ...prev.filter((v) => v.name !== name)].slice(0, 12));
    setSelectedSavedViewId(view.id);
    setSavedViewName('');
  };

  const deleteSelectedView = () => {
    if (!selectedSavedViewId) return;
    setSavedViews((prev) => prev.filter((v) => v.id !== selectedSavedViewId));
    setSelectedSavedViewId('');
  };

  const selectSavedView = (id: string) => {
    setSelectedSavedViewId(id);
    const selected = savedViews.find((view) => view.id === id);
    if (selected) applyFilters(selected.filters);
  };

  const uniqueGroups = useMemo<Array<[string, string]>>(() => {
    const seen = new Map<string, string>();
    let hasUnassigned = false;
    for (const task of tasks) {
      if (task.assigned_group_id && task.assigned_group_name) {
        seen.set(task.assigned_group_id, task.assigned_group_name);
      } else {
        hasUnassigned = true;
      }
    }
    const groups = Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    if (hasUnassigned) groups.push(['__none__', t('filters.unassigned')]);
    return groups;
  }, [tasks, t]);

  const rows = useMemo(() => buildServiceItemRows(tasks), [tasks]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (itemActivityFilter === 'active' && !row.service_item_is_active) return false;
      if (itemActivityFilter === 'inactive' && row.service_item_is_active) return false;

      if (automationFilter === 'with' && !row.hasAutomation) return false;
      if (automationFilter === 'without' && row.hasAutomation) return false;

      if (typeFilter && !row.tasks.some((t) => t.task_type === typeFilter)) return false;

      if (groupFilter === '__none__' && !row.tasks.some((t) => !t.assigned_group_id)) return false;
      if (groupFilter && groupFilter !== '__none__' && !row.tasks.some((t) => t.assigned_group_id === groupFilter)) return false;

      if (!q) return true;
      return (
        row.service_item_name.toLowerCase().includes(q) ||
        (row.category_name || '').toLowerCase().includes(q) ||
        row.tasks.some(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            (t.description || '').toLowerCase().includes(q) ||
            (t.assigned_group_name || '').toLowerCase().includes(q),
        )
      );
    }).sort((a, b) => {
      if (sortBy === 'nameAsc') return a.service_item_name.localeCompare(b.service_item_name);
      if (sortBy === 'automationFirst') {
        if (a.hasAutomation !== b.hasAutomation) return a.hasAutomation ? -1 : 1;
        if (a.taskCount !== b.taskCount) return b.taskCount - a.taskCount;
        return a.service_item_name.localeCompare(b.service_item_name);
      }
      if (a.service_item_is_active !== b.service_item_is_active) return a.service_item_is_active ? -1 : 1;
      if (a.taskCount !== b.taskCount) return b.taskCount - a.taskCount;
      return a.service_item_name.localeCompare(b.service_item_name);
    });
  }, [rows, search, itemActivityFilter, automationFilter, typeFilter, groupFilter, sortBy]);

  useEffect(() => {
    setExpandedItems((prev) => {
      const visibleIds = new Set(filteredRows.map((r) => r.service_item_id));
      const next = new Set<string>();
      for (const id of prev) {
        if (visibleIds.has(id)) next.add(id);
      }
      return next;
    });
  }, [filteredRows]);

  const totalTasks = useMemo(
    () => filteredRows.reduce((acc, row) => acc + row.taskCount, 0),
    [filteredRows],
  );
  const totalAutomatedItems = useMemo(
    () => filteredRows.filter((row) => row.hasAutomation).length,
    [filteredRows],
  );
  const totalInactiveItems = useMemo(
    () => filteredRows.filter((row) => !row.service_item_is_active).length,
    [filteredRows],
  );

  const toggleExpanded = (serviceItemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(serviceItemId)) next.delete(serviceItemId);
      else next.add(serviceItemId);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedItems(new Set(filteredRows.map((row) => row.service_item_id)));
  };

  const collapseAll = () => {
    setExpandedItems(new Set());
  };

  const openEditor = (serviceItemId: string) => {
    navigate('.', {
      state: {
        catalogTasksTab: 'by-item',
        focusServiceItemId: serviceItemId,
      } satisfies CatalogTasksListLocationState,
    });
  };

  return (
    <>
      <AllTasksFilters
        search={search}
        groupFilter={groupFilter}
        typeFilter={typeFilter}
        automationFilter={automationFilter}
        itemActivityFilter={itemActivityFilter}
        sortBy={sortBy}
        uniqueGroups={uniqueGroups}
        onSearchChange={(value) => {
          setSearch(value);
          syncParams({ ...currentFilterSet, search: value });
        }}
        onGroupFilterChange={(value) => {
          setGroupFilter(value);
          syncParams({ ...currentFilterSet, groupFilter: value });
        }}
        onTypeFilterChange={(value) => {
          setTypeFilter(value);
          syncParams({ ...currentFilterSet, typeFilter: value });
        }}
        onAutomationFilterChange={(value) => {
          setAutomationFilter(value);
          syncParams({ ...currentFilterSet, automationFilter: value });
        }}
        onItemActivityFilterChange={(value) => {
          setItemActivityFilter(value);
          syncParams({ ...currentFilterSet, itemActivityFilter: value });
        }}
        onSortByChange={(value) => {
          setSortBy(value);
          syncParams({ ...currentFilterSet, sortBy: value });
        }}
        savedViews={savedViews}
        selectedSavedViewId={selectedSavedViewId}
        savedViewName={savedViewName}
        onSelectSavedView={selectSavedView}
        onSavedViewNameChange={setSavedViewName}
        onSaveCurrentView={saveCurrentView}
        onDeleteSelectedView={deleteSelectedView}
        serviceItemCount={filteredRows.length}
        totalTasks={totalTasks}
        totalAutomatedItems={totalAutomatedItems}
        totalInactiveItems={totalInactiveItems}
      />

      {/* Service item overview table */}
      {filteredRows.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {search || groupFilter || typeFilter || automationFilter !== 'all' || itemActivityFilter !== 'all'
            ? t('emptyFiltered')
            : t('empty')}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
          <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {t('expandHint')}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={expandAll}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                {t('expandAll')}
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="text-xs text-gray-500 hover:text-gray-700 font-medium"
              >
                {t('collapseAll')}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-white">
                  <th className="px-4 py-3 text-left font-medium text-gray-500">{t('table.serviceItem')}</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">{t('table.category')}</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">{t('table.steps')}</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">{t('table.tasks')}</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">{t('table.types')}</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">{t('table.status')}</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((row) => (
                  <AllTasksTableRow
                    key={row.service_item_id}
                    row={row}
                    expanded={expandedItems.has(row.service_item_id)}
                    onToggle={toggleExpanded}
                    onOpenEditor={openEditor}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
