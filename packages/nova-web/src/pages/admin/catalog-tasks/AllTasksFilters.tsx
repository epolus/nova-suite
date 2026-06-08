/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import SearchBar from '../../../components/SearchBar';
import type { AllTasksSort, SavedAllTasksView } from './types';

export default function AllTasksFilters({
  search,
  groupFilter,
  typeFilter,
  automationFilter,
  itemActivityFilter,
  sortBy,
  uniqueGroups,
  onSearchChange,
  onGroupFilterChange,
  onTypeFilterChange,
  onAutomationFilterChange,
  onItemActivityFilterChange,
  onSortByChange,
  savedViews,
  selectedSavedViewId,
  savedViewName,
  onSelectSavedView,
  onSavedViewNameChange,
  onSaveCurrentView,
  onDeleteSelectedView,
  serviceItemCount,
  totalTasks,
  totalAutomatedItems,
  totalInactiveItems,
}: {
  search: string;
  groupFilter: string;
  typeFilter: string;
  automationFilter: 'all' | 'with' | 'without';
  itemActivityFilter: 'all' | 'active' | 'inactive';
  sortBy: AllTasksSort;
  uniqueGroups: Array<[string, string]>;
  onSearchChange: (value: string) => void;
  onGroupFilterChange: (value: string) => void;
  onTypeFilterChange: (value: string) => void;
  onAutomationFilterChange: (value: 'all' | 'with' | 'without') => void;
  onItemActivityFilterChange: (value: 'all' | 'active' | 'inactive') => void;
  onSortByChange: (value: AllTasksSort) => void;
  savedViews: SavedAllTasksView[];
  selectedSavedViewId: string;
  savedViewName: string;
  onSelectSavedView: (id: string) => void;
  onSavedViewNameChange: (name: string) => void;
  onSaveCurrentView: () => void;
  onDeleteSelectedView: () => void;
  serviceItemCount: number;
  totalTasks: number;
  totalAutomatedItems: number;
  totalInactiveItems: number;
}) {
  const t = useTranslations('pages.admin.catalogTasks');

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col xl:flex-row flex-wrap gap-3 mb-4">
        <div className="w-full sm:w-72 min-w-[12rem]">
          <SearchBar
            value={search}
            onChange={onSearchChange}
            placeholder={t('searchPlaceholder')}
          />
        </div>
        <select
          value={groupFilter}
          onChange={(e) => onGroupFilterChange(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-w-[10rem]"
        >
          <option value="">{t('filters.allGroups')}</option>
          {uniqueGroups.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
          <option value="__none__">{t('filters.unassigned')}</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => onTypeFilterChange(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-w-[9rem]"
        >
          <option value="">{t('filters.allTypes')}</option>
          <option value="approval">{t('filters.types.approval')}</option>
          <option value="manual">{t('filters.types.manual')}</option>
          <option value="automated">{t('filters.types.automated')}</option>
        </select>
        <select
          value={automationFilter}
          onChange={(e) => onAutomationFilterChange(e.target.value as 'all' | 'with' | 'without')}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-w-[12rem]"
        >
          <option value="all">{t('filters.allAutomation')}</option>
          <option value="with">{t('filters.withAutomation')}</option>
          <option value="without">{t('filters.withoutAutomation')}</option>
        </select>
        <select
          value={itemActivityFilter}
          onChange={(e) => onItemActivityFilterChange(e.target.value as 'all' | 'active' | 'inactive')}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-w-[12rem]"
        >
          <option value="all">{t('filters.allItems')}</option>
          <option value="active">{t('filters.activeItems')}</option>
          <option value="inactive">{t('filters.inactiveItems')}</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => onSortByChange(e.target.value as AllTasksSort)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-w-[14rem]"
        >
          <option value="taskCountDesc">{t('filters.sortTaskCount')}</option>
          <option value="nameAsc">{t('filters.sortName')}</option>
          <option value="automationFirst">{t('filters.sortAutomation')}</option>
        </select>
      </div>

      {/* Saved views */}
      <div className="flex flex-col xl:flex-row flex-wrap gap-3 mb-5">
        <select
          value={selectedSavedViewId}
          onChange={(e) => onSelectSavedView(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-w-[16rem]"
        >
          <option value="">{t('savedViews')}</option>
          {savedViews.map((view) => (
            <option key={view.id} value={view.id}>{view.name}</option>
          ))}
        </select>
        <input
          value={savedViewName}
          onChange={(e) => onSavedViewNameChange(e.target.value)}
          placeholder={t('saveFiltersPlaceholder')}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 min-w-[16rem]"
        />
        <button
          type="button"
          onClick={onSaveCurrentView}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
          disabled={!savedViewName.trim()}
        >
          {t('saveView')}
        </button>
        <button
          type="button"
          onClick={onDeleteSelectedView}
          className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          disabled={!selectedSavedViewId}
        >
          {t('deleteSelectedView')}
        </button>
      </div>

      {/* Summary */}
      <div className="flex gap-4 mb-6">
        <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm">
          <span className="text-gray-500">{t('summary.serviceItems')}</span>{' '}
          <span className="font-semibold text-gray-900">{serviceItemCount}</span>
        </div>
        <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm">
          <span className="text-gray-500">{t('summary.totalTasks')}</span>{' '}
          <span className="font-semibold text-gray-900">{totalTasks}</span>
        </div>
        <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm">
          <span className="text-gray-500">{t('summary.withAutomation')}</span>{' '}
          <span className="font-semibold text-gray-900">{totalAutomatedItems}</span>
        </div>
        <div className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm">
          <span className="text-gray-500">{t('summary.inactiveItems')}</span>{' '}
          <span className="font-semibold text-gray-900">{totalInactiveItems}</span>
        </div>
      </div>
    </>
  );
}
