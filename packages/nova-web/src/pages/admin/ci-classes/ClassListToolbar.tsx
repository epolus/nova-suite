/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';

type ActiveFilter = 'all' | 'active' | 'inactive';

type Props = {
  query: string;
  onQuery: (value: string) => void;
  activeFilter: ActiveFilter;
  onActiveFilter: (value: ActiveFilter) => void;
  forceExpand: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
};

export default function ClassListToolbar({
  query,
  onQuery,
  activeFilter,
  onActiveFilter,
  forceExpand,
  onExpandAll,
  onCollapseAll,
}: Props) {
  const t = useTranslations('pages.admin.ciClasses');

  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={t('searchPlaceholder')}
        className="w-full lg:w-80 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500"
      />
      <div className="flex flex-wrap gap-2">
        {(['all', 'active', 'inactive'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onActiveFilter(value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeFilter === value
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t(`filter.${value}`)}
          </button>
        ))}
      </div>
      <div className="flex gap-2 lg:ml-auto">
        <button
          type="button"
          onClick={onExpandAll}
          disabled={forceExpand}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40"
        >
          {t('expandAll')}
        </button>
        <button
          type="button"
          onClick={onCollapseAll}
          disabled={forceExpand}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40"
        >
          {t('collapseAll')}
        </button>
      </div>
    </div>
  );
}
