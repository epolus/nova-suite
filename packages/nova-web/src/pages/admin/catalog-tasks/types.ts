/* SPDX-License-Identifier: AGPL-3.0-only */
import type { AllCatalogTask, ServiceItem } from '../../../api/client';

export const TYPE_COLORS: Record<string, string> = {
  approval: 'bg-amber-100 text-amber-700',
  manual: 'bg-blue-100 text-blue-700',
  automated: 'bg-purple-100 text-purple-700',
};

export type ViewMode = 'all' | 'by-item';
export type AllTasksSort = 'taskCountDesc' | 'nameAsc' | 'automationFirst';
export type SavedAllTasksView = {
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

export const ALL_TASKS_SAVED_VIEWS_KEY = 'nova:catalogTasks:allTasksSavedViews';
export const ALL_TASKS_SAVED_VIEWS_SCOPE = 'catalog_tasks_all_tasks_saved_views';

/** Passed from `CatalogTaskDetailPage` via `navigate(..., { state })` when returning to this list. */
export type CatalogTasksListLocationState = {
  catalogTasksTab?: 'by-item';
  focusServiceItemId?: string;
};

export type ServiceItemTaskRow = {
  service_item_id: string;
  service_item_name: string;
  category_name: string;
  service_item_is_active: boolean;
  tasks: AllCatalogTask[];
  taskCount: number;
  stepCount: number;
  parallelStepCount: number;
  counts: { approval: number; manual: number; automated: number };
  hasAutomation: boolean;
  unassignedCount: number;
};

export function sortServiceItemsForPicker(list: ServiceItem[]): ServiceItem[] {
  return [...list].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    const c = (a.category_name || '').localeCompare(b.category_name || '');
    if (c !== 0) return c;
    return (a.name || '').localeCompare(b.name || '');
  });
}

export function buildServiceItemRows(tasks: AllCatalogTask[]): ServiceItemTaskRow[] {
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
}
