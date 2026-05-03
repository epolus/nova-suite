/* SPDX-License-Identifier: AGPL-3.0-only */
import { Fragment, useState, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { catalog } from '../../api/client';
import type { ServiceItem, CatalogTask, AllCatalogTask } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import ServiceItemCombobox from '../../components/ServiceItemCombobox';
import { useUserPreferenceState } from '../../hooks/useUserPreferenceState';

const TYPE_COLORS: Record<string, string> = {
  approval: 'bg-amber-100 text-amber-700',
  manual: 'bg-blue-100 text-blue-700',
  automated: 'bg-purple-100 text-purple-700',
};

type ViewMode = 'all' | 'by-item';
type AllTasksSort = 'taskCountDesc' | 'nameAsc' | 'automationFirst';
type SavedAllTasksView = {
  id: string;
  name: string;
  filters: {
    search: string;
    groupFilter: string;
    typeFilter: string;
    automationFilter: 'all' | 'with' | 'without';
    itemActivityFilter: 'all' | 'active' | 'inactive';
    sortBy: AllTasksSort;
  };
};

const ALL_TASKS_SAVED_VIEWS_KEY = 'nova:catalogTasks:allTasksSavedViews';
const ALL_TASKS_SAVED_VIEWS_SCOPE = 'catalog_tasks_all_tasks_saved_views';

/** Passed from `CatalogTaskDetailPage` via `navigate(..., { state })` when returning to this list. */
export type CatalogTasksListLocationState = {
  catalogTasksTab?: 'by-item';
  focusServiceItemId?: string;
};

function sortServiceItemsForPicker(list: ServiceItem[]): ServiceItem[] {
  return [...list].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    const c = (a.category_name || '').localeCompare(b.category_name || '');
    if (c !== 0) return c;
    return (a.name || '').localeCompare(b.name || '');
  });
}

export default function CatalogTasksPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [byItemSelection, setByItemSelection] = useState<string>('');
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [allCatalogTasks, setAllCatalogTasks] = useState<AllCatalogTask[]>([]);
  const [loading, setLoading] = useState(true);

  const itemsForPicker = useMemo(() => sortServiceItemsForPicker(items), [items]);

  const refreshCatalogTasks = useCallback(() => {
    catalog.allTasks().then((res) => setAllCatalogTasks(res.tasks));
  }, []);

  const taskCountsByItemId = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of allCatalogTasks) {
      m[t.service_item_id] = (m[t.service_item_id] || 0) + 1;
    }
    return m;
  }, [allCatalogTasks]);

  useEffect(() => {
    Promise.all([catalog.allItems(), catalog.allTasks()]).then(([itemsRes, tasksRes]) => {
      setItems(itemsRes.items);
      setAllCatalogTasks(tasksRes.tasks);
      setLoading(false);
    });
  }, []);

  useLayoutEffect(() => {
    const st = location.state as CatalogTasksListLocationState | null | undefined;
    if (!st || (st.catalogTasksTab !== 'by-item' && !st.focusServiceItemId)) return;
    setViewMode('by-item');
    if (typeof st.focusServiceItemId === 'string' && st.focusServiceItemId) {
      setByItemSelection(st.focusServiceItemId);
    }
    navigate('.', { replace: true, state: {} });
  }, [location.state, navigate]);

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Catalog Workflow Tasks"
        description="Define fulfillment steps per service item. Inactive items are included so you can build a workflow before publishing the catalog entry."
      />

      {/* View mode tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setViewMode('all')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          All Tasks
        </button>
        <button
          onClick={() => setViewMode('by-item')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'by-item' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          By Service Item
        </button>
      </div>

      {viewMode === 'all' ? (
        <AllTasksView tasks={allCatalogTasks} />
      ) : (
        <ByItemView
          items={itemsForPicker}
          selectedItemId={byItemSelection}
          onSelectedItemIdChange={setByItemSelection}
          taskCountsByItemId={taskCountsByItemId}
          onTasksMutated={refreshCatalogTasks}
        />
      )}
    </>
  );
}

/* ─── All Tasks View (grouped by assignment group) ─── */

function AllTasksView({ tasks }: { tasks: AllCatalogTask[] }) {
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

  const uniqueGroups = useMemo(() => {
    const seen = new Map<string, string>();
    let hasUnassigned = false;
    for (const t of tasks) {
      if (t.assigned_group_id && t.assigned_group_name) {
        seen.set(t.assigned_group_id, t.assigned_group_name);
      } else {
        hasUnassigned = true;
      }
    }
    const groups = Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    if (hasUnassigned) groups.push(['__none__', 'Unassigned']);
    return groups;
  }, [tasks]);

  const rows = useMemo(() => {
    const grouped = new Map<string, {
      service_item_id: string;
      service_item_name: string;
      category_name: string;
      service_item_is_active: boolean;
      tasks: AllCatalogTask[];
    }>();

    for (const task of tasks) {
      const existing = grouped.get(task.service_item_id);
      if (existing) {
        existing.tasks.push(task);
        if (!existing.category_name && task.category_name) existing.category_name = task.category_name;
      } else {
        grouped.set(task.service_item_id, {
          service_item_id: task.service_item_id,
          service_item_name: task.service_item_name,
          category_name: task.category_name,
          service_item_is_active: task.service_item_is_active !== false,
          tasks: [task],
        });
      }
    }

    return Array.from(grouped.values())
      .map((group) => {
        const sortedTasks = [...group.tasks].sort((a, b) => {
          if (a.task_order !== b.task_order) return a.task_order - b.task_order;
          return a.name.localeCompare(b.name);
        });

        const counts = { approval: 0, manual: 0, automated: 0 };
        let unassignedCount = 0;
        const stepMap = new Map<number, number>();
        for (const task of sortedTasks) {
          counts[task.task_type] += 1;
          if (!task.assigned_group_id) unassignedCount += 1;
          stepMap.set(task.task_order, (stepMap.get(task.task_order) || 0) + 1);
        }
        const parallelStepCount = Array.from(stepMap.values()).filter((v) => v > 1).length;

        return {
          ...group,
          tasks: sortedTasks,
          taskCount: sortedTasks.length,
          stepCount: stepMap.size,
          parallelStepCount,
          counts,
          hasAutomation: counts.automated > 0,
          unassignedCount,
        };
      })
      .sort((a, b) => {
        if (a.service_item_is_active !== b.service_item_is_active) return a.service_item_is_active ? -1 : 1;
        const category = (a.category_name || '').localeCompare(b.category_name || '');
        if (category !== 0) return category;
        return a.service_item_name.localeCompare(b.service_item_name);
      });
  }, [tasks]);

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

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col xl:flex-row flex-wrap gap-3 mb-4">
        <div className="w-full sm:w-72 min-w-[12rem]">
          <SearchBar
            value={search}
            onChange={(value) => {
              const next = { ...currentFilterSet, search: value };
              setSearch(value);
              syncParams(next);
            }}
            placeholder="Search tasks, items, groups..."
          />
        </div>
        <select
          value={groupFilter}
          onChange={(e) => {
            const value = e.target.value;
            const next = { ...currentFilterSet, groupFilter: value };
            setGroupFilter(value);
            syncParams(next);
          }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-w-[10rem]"
        >
          <option value="">All Groups</option>
          {uniqueGroups.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
          <option value="__none__">Unassigned</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => {
            const value = e.target.value;
            const next = { ...currentFilterSet, typeFilter: value };
            setTypeFilter(value);
            syncParams(next);
          }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-w-[9rem]"
        >
          <option value="">All Types</option>
          <option value="approval">Approval</option>
          <option value="manual">Manual</option>
          <option value="automated">Automated</option>
        </select>
        <select
          value={automationFilter}
          onChange={(e) => {
            const value = e.target.value as 'all' | 'with' | 'without';
            const next = { ...currentFilterSet, automationFilter: value };
            setAutomationFilter(value);
            syncParams(next);
          }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-w-[12rem]"
        >
          <option value="all">All automation states</option>
          <option value="with">With automated steps</option>
          <option value="without">Without automated steps</option>
        </select>
        <select
          value={itemActivityFilter}
          onChange={(e) => {
            const value = e.target.value as 'all' | 'active' | 'inactive';
            const next = { ...currentFilterSet, itemActivityFilter: value };
            setItemActivityFilter(value);
            syncParams(next);
          }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-w-[12rem]"
        >
          <option value="all">All catalog items</option>
          <option value="active">Active catalog items only</option>
          <option value="inactive">Inactive catalog items only</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => {
            const value = e.target.value as AllTasksSort;
            const next = { ...currentFilterSet, sortBy: value };
            setSortBy(value);
            syncParams(next);
          }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-w-[14rem]"
        >
          <option value="taskCountDesc">Sort: Most tasks first</option>
          <option value="nameAsc">Sort: Item name A-Z</option>
          <option value="automationFirst">Sort: Automation first</option>
        </select>
      </div>

      {/* Saved views */}
      <div className="flex flex-col xl:flex-row flex-wrap gap-3 mb-5">
        <select
          value={selectedSavedViewId}
          onChange={(e) => {
            const id = e.target.value;
            setSelectedSavedViewId(id);
            const selected = savedViews.find((view) => view.id === id);
            if (selected) applyFilters(selected.filters);
          }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-w-[16rem]"
        >
          <option value="">Saved views</option>
          {savedViews.map((view) => (
            <option key={view.id} value={view.id}>{view.name}</option>
          ))}
        </select>
        <input
          value={savedViewName}
          onChange={(e) => setSavedViewName(e.target.value)}
          placeholder="Save current filters as..."
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-w-[16rem]"
        />
        <button
          type="button"
          onClick={saveCurrentView}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
          disabled={!savedViewName.trim()}
        >
          Save view
        </button>
        <button
          type="button"
          onClick={deleteSelectedView}
          className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          disabled={!selectedSavedViewId}
        >
          Delete selected view
        </button>
      </div>

      {/* Summary */}
      <div className="flex gap-4 mb-6">
        <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm">
          <span className="text-gray-500">Service items:</span>{' '}
          <span className="font-semibold text-gray-900">{filteredRows.length}</span>
        </div>
        <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm">
          <span className="text-gray-500">Total tasks:</span>{' '}
          <span className="font-semibold text-gray-900">{totalTasks}</span>
        </div>
        <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm">
          <span className="text-gray-500">With automation:</span>{' '}
          <span className="font-semibold text-gray-900">{totalAutomatedItems}</span>
        </div>
        <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm">
          <span className="text-gray-500">Inactive items:</span>{' '}
          <span className="font-semibold text-gray-900">{totalInactiveItems}</span>
        </div>
      </div>

      {/* Service item overview table */}
      {filteredRows.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {search || groupFilter || typeFilter || automationFilter !== 'all' || itemActivityFilter !== 'all'
            ? 'No service items matching the current filters.'
            : 'No catalog tasks defined yet.'}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
          <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Expand service items to inspect step details and open a task directly.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={expandAll}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="text-xs text-gray-500 hover:text-gray-700 font-medium"
              >
                Collapse all
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-white">
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Service Item</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Category</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Steps</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Tasks</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Types</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((row) => {
                  const expanded = expandedItems.has(row.service_item_id);
                  return (
                    <Fragment key={row.service_item_id}>
                      <tr key={row.service_item_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(row.service_item_id)}
                            className="flex items-center gap-2 text-left"
                          >
                            <span className={`inline-block transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate">{row.service_item_name}</p>
                              {row.unassignedCount > 0 && (
                                <p className="text-xs text-amber-700 mt-0.5">
                                  {row.unassignedCount} task(s) without assignment group
                                </p>
                              )}
                            </div>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{row.category_name || '—'}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {row.stepCount}
                          {row.parallelStepCount > 0 && (
                            <span className="text-xs text-indigo-600 ml-1">({row.parallelStepCount} parallel)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{row.taskCount}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {row.counts.approval > 0 && (
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS.approval}`}>
                                {row.counts.approval} approval
                              </span>
                            )}
                            {row.counts.manual > 0 && (
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS.manual}`}>
                                {row.counts.manual} manual
                              </span>
                            )}
                            {row.counts.automated > 0 && (
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS.automated}`}>
                                {row.counts.automated} automated
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {row.service_item_is_active ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                              active
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                              inactive
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => navigate('.', {
                              state: {
                                catalogTasksTab: 'by-item',
                                focusServiceItemId: row.service_item_id,
                              } satisfies CatalogTasksListLocationState,
                            })}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            Open editor
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={7} className="px-4 py-3 bg-gray-50/60">
                            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                              <div className="divide-y divide-gray-100">
                                {row.tasks.map((task) => (
                                  <div key={task.id} className="px-4 py-3 flex items-center gap-3">
                                    <div className="w-14 shrink-0">
                                      <span className="inline-flex items-center justify-center rounded-full bg-indigo-600 text-white text-[11px] font-semibold w-8 h-8">
                                        {task.task_order}
                                      </span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-medium text-gray-900">{task.name}</p>
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[task.task_type]}`}>
                                          {task.task_type}
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-500 mt-0.5">
                                        {task.assigned_group_name || 'Unassigned'}
                                        {task.sla_hours ? ` · SLA ${task.sla_hours}h` : ''}
                                        {task.description ? ` · ${task.description}` : ''}
                                      </p>
                                    </div>
                                    <Link
                                      to={`/admin/catalog-tasks/${task.service_item_id}/${task.id}`}
                                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                    >
                                      Details
                                    </Link>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── By Service Item View (the editor) ─── */

function ByItemView({
  items,
  selectedItemId: selectedItem,
  onSelectedItemIdChange: setSelectedItem,
  taskCountsByItemId,
  onTasksMutated,
}: {
  items: ServiceItem[];
  selectedItemId: string;
  onSelectedItemIdChange: (id: string) => void;
  taskCountsByItemId: Record<string, number>;
  onTasksMutated: () => void;
}) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<CatalogTask[]>([]);
  const [taskLoading, setTaskLoading] = useState(false);

  useEffect(() => {
    if (!selectedItem) {
      setTasks([]);
      return;
    }
    setTaskLoading(true);
    catalog.itemTasks(selectedItem).then((res) => {
      setTasks(res.tasks);
      setTaskLoading(false);
    });
  }, [selectedItem]);

  const selectedItemMeta = useMemo(
    () => items.find((i) => i.id === selectedItem),
    [items, selectedItem],
  );

  const handleEdit = (task: CatalogTask) => {
    navigate(`/admin/catalog-tasks/${selectedItem}/${task.id}`);
  };

  const handleDelete = async (taskId: string) => {
    if (!confirm('Delete this task definition?')) return;
    await catalog.deleteItemTask(selectedItem, taskId);
    setTasks(tasks.filter((t) => t.id !== taskId));
    onTasksMutated();
  };

  const orderGroups = new Map<number, CatalogTask[]>();
  for (const task of tasks) {
    const group = orderGroups.get(task.task_order) || [];
    group.push(task);
    orderGroups.set(task.task_order, group);
  }
  const sortedOrders = Array.from(orderGroups.keys()).sort((a, b) => a - b);

  return (
    <>
      <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-900">
        <p className="font-medium text-indigo-950">Tip</p>
        <p className="text-indigo-900/90 mt-1">
          Search below, pick a catalog item (inactive ones are included), then use{' '}
          <span className="font-medium">Add task</span> to open the editor. Activate the item in{' '}
          <Link to="/admin/service-items" className="font-medium underline decoration-indigo-400 underline-offset-2 hover:text-indigo-700">
            Service Item Designer
          </Link>{' '}
          when the workflow is ready.
        </p>
      </div>

      <div className="mb-6 max-w-xl">
        <label className="block text-sm font-medium text-gray-700 mb-1">Service item</label>
        <ServiceItemCombobox
          items={items}
          value={selectedItem}
          onChange={(id) => setSelectedItem(id)}
          taskCounts={taskCountsByItemId}
          placeholder="Search and select a service item…"
        />
        {selectedItemMeta && !selectedItemMeta.is_active && (
          <p className="text-xs text-amber-800 mt-2">
            This item is inactive — it will not appear in the ESS catalog until you activate it in Service Item Designer.
          </p>
        )}
      </div>

      {selectedItem && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Tasks ({tasks.length})</h3>
              {selectedItemMeta && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {selectedItemMeta.name}
                  {selectedItemMeta.category_name ? ` · ${selectedItemMeta.category_name}` : ''}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => navigate(`/admin/catalog-tasks/${selectedItem}/new`)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors w-fit"
            >
              + Add task
            </button>
          </div>

          {taskLoading ? (
            <Spinner />
          ) : (
            <div className="space-y-4 mt-4">
              {sortedOrders.length === 0 && (
                <div className="text-center py-12 text-gray-400 text-sm">
                  No workflow tasks yet. Use <span className="font-medium text-gray-600">Add task</span> to define steps (same screen as edit).
                </div>
              )}
              {sortedOrders.map((order) => {
                const group = orderGroups.get(order)!;
                const isParallel = group.length > 1;
                return (
                  <div key={order} className={`rounded-xl border ${isParallel ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-200 bg-white'} overflow-hidden`}>
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">{order}</span>
                      <span className="text-xs font-medium text-gray-500">
                        Step {order}{isParallel ? ` (${group.length} tasks in parallel)` : ''}
                      </span>
                    </div>
                    <div className={`divide-y divide-gray-100 ${isParallel ? 'grid grid-cols-1 md:grid-cols-2 divide-y-0 gap-px bg-gray-100' : ''}`}>
                      {group.map((task) => (
                        <div key={task.id} className="px-4 py-3 bg-white flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900">{task.name}</p>
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[task.task_type]}`}>
                                {task.task_type}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {task.assigned_group_name || 'No group assigned'}
                              {task.sla_hours ? ` | SLA: ${task.sla_hours}h` : ''}
                              {task.description ? ` | ${task.description}` : ''}
                            </p>
                          </div>
                          <button type="button" onClick={() => handleEdit(task)} className="text-xs text-indigo-600 hover:text-indigo-800">
                            Edit
                          </button>
                          <button type="button" onClick={() => handleDelete(task.id)} className="text-xs text-red-500 hover:text-red-700">
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
