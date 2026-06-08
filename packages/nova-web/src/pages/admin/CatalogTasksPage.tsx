/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { useTranslations } from 'use-intl';
import { useLocation, useNavigate } from 'react-router-dom';
import { catalog } from '../../api/client';
import type { ServiceItem, AllCatalogTask } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import AllTasksView from './catalog-tasks/AllTasksView';
import ByItemView from './catalog-tasks/ByItemView';
import { sortServiceItemsForPicker, type ViewMode } from './catalog-tasks/types';
import type { CatalogTasksListLocationState } from './catalog-tasks/types';

export type { CatalogTasksListLocationState } from './catalog-tasks/types';

export default function CatalogTasksPage() {
  const t = useTranslations('pages.admin.catalogTasks');
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
    for (const task of allCatalogTasks) {
      m[task.service_item_id] = (m[task.service_item_id] || 0) + 1;
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
        title={t('title')}
        description={t('description')}
      />

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setViewMode('all')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('tabs.allTasks')}
        </button>
        <button
          onClick={() => setViewMode('by-item')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'by-item' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t('tabs.byServiceItem')}
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
