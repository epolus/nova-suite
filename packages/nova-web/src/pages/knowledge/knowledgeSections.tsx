/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { KnowledgeArticle, KnowledgeCategory } from '../../api/client';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import { useStatusLabel } from '@/i18n/hooks';

export type StatusFilter = 'all' | 'draft' | 'review' | 'published' | 'retired';

export type KnowledgeForm = {
  title: string;
  content: string;
  category_id: string;
  assignment_group_id: string;
  status: KnowledgeArticle['status'];
};

const STATUS_FILTERS: StatusFilter[] = ['all', 'draft', 'review', 'published', 'retired'];

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white';

export function ArticleListPanel({
  articles,
  categories,
  categoryLabelById,
  categoryCounts,
  filtered,
  isReadOnlyView,
  selectedId,
  selectedCategoryId,
  setSelectedCategoryId,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  openArticle,
}: {
  articles: KnowledgeArticle[];
  categories: KnowledgeCategory[];
  categoryLabelById: Map<string, string>;
  categoryCounts: { counts: Map<string, number>; uncategorized: number };
  filtered: KnowledgeArticle[];
  isReadOnlyView: boolean;
  selectedId: string | 'new' | null;
  selectedCategoryId: string;
  setSelectedCategoryId: (id: string) => void;
  search: string;
  setSearch: (value: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (value: StatusFilter) => void;
  openArticle: (id: string) => void;
}) {
  const t = useTranslations('pages.knowledge');
  const tStates = useTranslations('common.states');
  const statusLabel = useStatusLabel();

  const categoryNavItem = (id: string, label: string, count: number) => {
    const isActive = selectedCategoryId === id;
    return (
      <button
        key={id}
        onClick={() => setSelectedCategoryId(id)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
          isActive
            ? 'bg-indigo-50 text-indigo-700 font-medium'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        <span className="truncate">{label}</span>
        <span className={`text-xs ml-2 flex-shrink-0 ${isActive ? 'text-indigo-500' : 'text-gray-400'}`}>{count}</span>
      </button>
    );
  };

  return (
    <div className="lg:col-span-1 space-y-4">

      {/* Categories */}
      <Card>
        <h3 className="font-semibold text-gray-900 mb-3">{t('categories')}</h3>
        <div className="space-y-0.5">
          {categoryNavItem('all', t('allCategories'), isReadOnlyView ? articles.filter((a) => a.status === 'published').length : articles.length)}
          {categories.map((c) =>
            categoryNavItem(c.id, categoryLabelById.get(c.id) || c.name, categoryCounts.counts.get(c.id) || 0),
          )}
          {categoryNavItem('uncategorized', t('uncategorized'), categoryCounts.uncategorized)}
        </div>
      </Card>

      {/* Article list */}
      <Card>
        <div className="space-y-3">
          {/* Search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className={inputCls}
          />

          {!isReadOnlyView && (
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {s === 'all' ? tStates('all') : statusLabel(s)}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1 max-h-[55vh] overflow-y-auto -mx-1 px-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">{t('noArticles')}</p>
            ) : (
              filtered.map((a) => (
                <button
                  key={a.id}
                  onClick={() => openArticle(a.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    selectedId === a.id
                      ? 'border-indigo-200 bg-indigo-50'
                      : 'border-transparent hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs text-gray-400 font-mono">{a.number}</span>
                    <Badge value={a.status} />
                  </div>
                  <p className={`text-sm font-medium truncate ${selectedId === a.id ? 'text-indigo-800' : 'text-gray-900'}`}>
                    {a.title}
                  </p>
                  {a.category_id && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {categoryLabelById.get(a.category_id) || a.category_name}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
