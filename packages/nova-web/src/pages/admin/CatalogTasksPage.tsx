/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { catalog } from '../../api/client';
import type { ServiceItem, CatalogTask, AllCatalogTask } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import ServiceItemCombobox from '../../components/ServiceItemCombobox';

const TYPE_COLORS: Record<string, string> = {
  approval: 'bg-amber-100 text-amber-700',
  manual: 'bg-blue-100 text-blue-700',
  automated: 'bg-purple-100 text-purple-700',
};

type ViewMode = 'all' | 'by-item';

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
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [itemActivityFilter, setItemActivityFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const filtered = useMemo(() => {
    let result = tasks;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.service_item_name.toLowerCase().includes(q) ||
          (t.assigned_group_name && t.assigned_group_name.toLowerCase().includes(q)) ||
          (t.description && t.description.toLowerCase().includes(q)),
      );
    }
    if (groupFilter) {
      result = result.filter((t) => t.assigned_group_id === groupFilter);
    }
    if (typeFilter) {
      result = result.filter((t) => t.task_type === typeFilter);
    }
    if (itemActivityFilter === 'active') {
      result = result.filter((t) => t.service_item_is_active !== false);
    }
    if (itemActivityFilter === 'inactive') {
      result = result.filter((t) => t.service_item_is_active === false);
    }
    return result;
  }, [tasks, search, groupFilter, typeFilter, itemActivityFilter]);

  // Group by assignment group
  const byGroup = useMemo(() => {
    const map = new Map<string, { groupName: string; tasks: AllCatalogTask[] }>();
    for (const task of filtered) {
      const key = task.assigned_group_id || '__none__';
      const entry = map.get(key) || { groupName: task.assigned_group_name || 'Unassigned', tasks: [] };
      entry.tasks.push(task);
      map.set(key, entry);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === '__none__') return 1;
      if (b[0] === '__none__') return -1;
      return a[1].groupName.localeCompare(b[1].groupName);
    });
  }, [filtered]);

  // Unique groups for the filter
  const uniqueGroups = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tasks) {
      if (t.assigned_group_id && t.assigned_group_name) {
        seen.set(t.assigned_group_id, t.assigned_group_name);
      }
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col xl:flex-row flex-wrap gap-3 mb-4">
        <div className="w-full sm:w-72 min-w-[12rem]">
          <SearchBar value={search} onChange={setSearch} placeholder="Search tasks, items, groups..." />
        </div>
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
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
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-w-[9rem]"
        >
          <option value="">All Types</option>
          <option value="approval">Approval</option>
          <option value="manual">Manual</option>
          <option value="automated">Automated</option>
        </select>
        <select
          value={itemActivityFilter}
          onChange={(e) => setItemActivityFilter(e.target.value as 'all' | 'active' | 'inactive')}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-w-[12rem]"
        >
          <option value="all">All catalog items</option>
          <option value="active">Active catalog items only</option>
          <option value="inactive">Inactive catalog items only</option>
        </select>
      </div>

      {/* Summary */}
      <div className="flex gap-4 mb-6">
        <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm">
          <span className="text-gray-500">Total tasks:</span>{' '}
          <span className="font-semibold text-gray-900">{filtered.length}</span>
        </div>
        <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm">
          <span className="text-gray-500">Groups:</span>{' '}
          <span className="font-semibold text-gray-900">{byGroup.length}</span>
        </div>
        <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm">
          <span className="text-gray-500">Service items:</span>{' '}
          <span className="font-semibold text-gray-900">
            {new Set(filtered.map((t) => t.service_item_id)).size}
          </span>
        </div>
      </div>

      {/* Tasks grouped by assignment group */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {search || groupFilter || typeFilter || itemActivityFilter !== 'all'
            ? 'No tasks matching the current filters.'
            : 'No catalog tasks defined yet.'}
        </div>
      ) : (
        <div className="space-y-6">
          {byGroup.map(([groupId, { groupName, tasks }]) => (
            <div key={groupId} className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold">
                    {tasks.length}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{groupName}</h3>
                    <p className="text-xs text-gray-400">
                      {new Set(tasks.map((t) => t.service_item_name)).size} service item(s)
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {['approval', 'manual', 'automated'].map((type) => {
                    const count = tasks.filter((t) => t.task_type === type).length;
                    if (count === 0) return null;
                    return (
                      <span key={type} className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[type]}`}>
                        {count} {type}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {tasks.map((task) => (
                  <div key={task.id} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">{task.name}</p>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[task.task_type]}`}>
                          {task.task_type}
                        </span>
                        {!task.is_active && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">inactive</span>
                        )}
                      </div>
                      {task.description && <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-medium text-indigo-600 flex items-center justify-end gap-1 flex-wrap">
                        <span>{task.service_item_name}</span>
                        {task.service_item_is_active === false && (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">item inactive</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400">{task.category_name} &middot; Step {task.task_order}</p>
                    </div>
                    {task.sla_hours && (
                      <span className="text-xs text-gray-400 flex-shrink-0">SLA {task.sla_hours}h</span>
                    )}
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
          ))}
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
