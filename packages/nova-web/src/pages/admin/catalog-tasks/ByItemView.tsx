/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Link, useNavigate } from 'react-router-dom';
import { catalog } from '../../../api/client';
import type { CatalogTask, ServiceItem } from '../../../api/client';
import Spinner from '../../../components/Spinner';
import ServiceItemCombobox from '../../../components/ServiceItemCombobox';
import { TYPE_COLORS } from './types';

export default function ByItemView({
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
  const t = useTranslations('pages.admin.catalogTasks');
  const tActions = useTranslations('common.actions');
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
    if (!confirm(t('confirmDelete'))) return;
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
        <p className="font-medium text-indigo-950">{t('tipTitle')}</p>
        <p className="text-indigo-900/90 mt-1">
          {t('tipBodyPrefix')}{' '}
          <span className="font-medium">{t('addTask')}</span> {t('tipBodyMiddle')}{' '}
          <Link to="/admin/service-items" className="font-medium underline decoration-indigo-400 underline-offset-2 hover:text-indigo-700">
            {t('serviceItemDesigner')}
          </Link>{' '}
          {t('tipBodySuffix')}
        </p>
      </div>

      <div className="mb-6 max-w-xl">
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('serviceItemLabel')}</label>
        <ServiceItemCombobox
          items={items}
          value={selectedItem}
          onChange={(id) => setSelectedItem(id)}
          taskCounts={taskCountsByItemId}
          placeholder={t('serviceItemPlaceholder')}
        />
        {selectedItemMeta && !selectedItemMeta.is_active && (
          <p className="text-xs text-amber-800 mt-2">
            {t('inactiveWarning')}
          </p>
        )}
      </div>

      {selectedItem && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{t('tasksTitle', { count: tasks.length })}</h3>
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
              + {t('addTask')}
            </button>
          </div>

          {taskLoading ? (
            <Spinner />
          ) : (
            <div className="space-y-4 mt-4">
              {sortedOrders.length === 0 && (
                <div className="text-center py-12 text-gray-400 text-sm">
                  {t('emptyWorkflow')}
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
                        {t('step', { order })}{isParallel ? ` ${t('parallelTasks', { count: group.length })}` : ''}
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
                              {task.assigned_group_name || t('noGroupAssigned')}
                              {task.sla_hours ? ` | ${t('slaHoursColon', { hours: task.sla_hours })}` : ''}
                              {task.description ? ` | ${task.description}` : ''}
                            </p>
                          </div>
                          <button type="button" onClick={() => handleEdit(task)} className="text-xs text-indigo-600 hover:text-indigo-800">
                            {tActions('edit')}
                          </button>
                          <button type="button" onClick={() => handleDelete(task.id)} className="text-xs text-red-500 hover:text-red-700">
                            {tActions('delete')}
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
