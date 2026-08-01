/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { catalog } from '../../api/client';
import type { ServiceItem, Category } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import { useTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/currency';
import AuthImage from './AuthImage';
import ServiceItemForm from './ServiceItemForm';

export default function ServiceItemsPage() {
  const t = useTranslations('pages.admin.serviceItems');
  const tActions = useTranslations('common.actions');
  const tStates = useTranslations('common.states');
  const tList = useTranslations('common.list');
  const tMaster = useTranslations('common.masterData');
  const { theme } = useTheme();
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      catalog.allItems(),
      catalog.categories(),
    ]).then(([itemsRes, catsRes]) => {
      setItems(itemsRes.items);
      setCategories(catsRes.categories);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((i) =>
      i.name.toLowerCase().includes(q) ||
      (i.short_description && i.short_description.toLowerCase().includes(q)) ||
      (i.category_name && i.category_name.toLowerCase().includes(q)),
    );
  }, [items, search]);

  const handleSaved = (item: ServiceItem) => {
    if (creating) {
      setItems([...items, item]);
      setCreating(false);
    } else {
      setItems(items.map((i) => (i.id === item.id ? item : i)));
      setEditing(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirmDeactivate'))) return;
    await catalog.deleteItem(id);
    setItems(items.map((i) => (i.id === id ? { ...i, is_active: false } : i)));
  };

  if (loading) return <Spinner />;

  if (creating || editing) {
    return (
      <ServiceItemForm
        item={editing || undefined}
        categories={categories}
        currencyCode={theme.catalog_currency}
        onSave={handleSaved}
        onCancel={() => { setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            {t('newItem')}
          </button>
        }
      />

      <div className="mb-4 w-full sm:w-80">
        <SearchBar value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {search
            ? tList('noMatching', { entity: t('title').toLowerCase(), query: search })
            : tList('createFirst', { entity: t('title').toLowerCase() })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <Card key={item.id} className={`relative transition-shadow hover:shadow-md ${!item.is_active ? 'opacity-50' : ''}`}>
              {/* Picture */}
              {item.picture_storage_key && (
                <div className="mb-3 -mx-5 -mt-5 rounded-t-xl overflow-hidden">
                  <AuthImage itemId={item.id} className="w-full h-40 object-cover" />
                </div>
              )}
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{item.name}</h3>
                  <p className="text-xs text-indigo-500 mt-0.5">{item.category_name}</p>
                </div>
                {item.price != null && (
                  <span className="text-sm font-semibold text-green-700 flex-shrink-0 ml-2">
                    {formatCurrency(Number(item.price), theme.catalog_currency)}
                  </span>
                )}
              </div>
              {item.short_description && (
                <p className="text-sm text-gray-500 mt-2 line-clamp-2">{item.short_description}</p>
              )}
              {/* Custom attributes preview */}
              {item.custom_attributes && Object.keys(item.custom_attributes as Record<string, unknown>).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.entries(item.custom_attributes as Record<string, unknown>).slice(0, 3).map(([k, v]) => (
                    <span key={k} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {k}: {String(v)}
                    </span>
                  ))}
                  {Object.keys(item.custom_attributes as Record<string, unknown>).length > 3 && (
                    <span className="text-xs text-gray-400">{t('moreAttributes', { count: Object.keys(item.custom_attributes as Record<string, unknown>).length - 3 })}</span>
                  )}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {item.approval_required && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{t('managerApproval')}</span>
                  )}
                  <span className="text-xs text-gray-400">{t('slaHours', { hours: item.sla_hours })}</span>
                  {!item.is_active && (
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{tStates('inactive')}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(item)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">{tActions('edit')}</button>
                  {item.is_active && (
                    <button onClick={() => handleDelete(item.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">{tMaster('deactivate')}</button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
