/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import type { FieldDef } from './MasterDataPage';

interface MasterDataDetailPageProps<T extends { id: string; is_active: boolean }> {
  title: string;
  basePath: string;
  fetchItems: () => Promise<T[]>;
  createItem: (data: Record<string, unknown>) => Promise<{ id?: string } | unknown>;
  updateItem: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  getDefaults: (item: T | null) => Record<string, string>;
  searchFilter: (item: T, query: string) => boolean;
  fields: FieldDef[];
}

function getNestedValue(obj: unknown, key: string): unknown {
  if (key === '_status') return (obj as { is_active: boolean }).is_active ? 0 : 1;
  return (obj as Record<string, unknown>)[key];
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

export default function MasterDataDetailPage<T extends { id: string; is_active: boolean }>({
  title,
  basePath,
  fetchItems,
  createItem,
  updateItem,
  getDefaults,
  searchFilter,
  fields,
}: MasterDataDetailPageProps<T>) {
  const t = useTranslations('pages.admin.masterDataDetail');
  const tMaster = useTranslations('common.masterData');
  const tActions = useTranslations('common.actions');
  const tFields = useTranslations('common.fields');
  const tStates = useTranslations('common.states');
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const location = useLocation();

  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const listParams = useMemo<Record<string, string>>(
    () => (location.state as { listParams?: Record<string, string> } | null)?.listParams || {},
    [location.state],
  );
  const activeFilter = listParams.active || 'all';
  const sortBy = listParams.sort_by || '';
  const sortDir = listParams.sort_dir === 'asc' ? 'asc' : 'desc';
  const search = (listParams.search || '').toLowerCase();
  const colFilters = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [key, val] of Object.entries(listParams)) {
      if (key.startsWith('cf.') && val) map[key.slice(3)] = val;
    }
    return map;
  }, [listParams]);

  const load = useCallback(async (): Promise<T[]> => {
    setLoading(true);
    try {
      const data = await fetchItems();
      setItems(data);
      return data;
    } catch (err) {
      console.error('Failed to load data:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [fetchItems]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => {
    let list = items;
    if (activeFilter === 'active') list = list.filter((i) => i.is_active);
    else if (activeFilter === 'inactive') list = list.filter((i) => !i.is_active);
    if (search) list = list.filter((i) => searchFilter(i, search));
    for (const [col, val] of Object.entries(colFilters)) {
      const lower = val.toLowerCase();
      list = list.filter((item) => {
        if (col === '_status') {
          const label = item.is_active ? 'active' : 'inactive';
          return label.startsWith(lower);
        }
        const raw = (item as Record<string, unknown>)[col];
        return raw != null && String(raw).toLowerCase().startsWith(lower);
      });
    }
    if (!sortBy) return list;
    return [...list].sort((a, b) => {
      const aVal = getNestedValue(a, sortBy);
      const bVal = getNestedValue(b, sortBy);
      const cmp = compareValues(aVal, bVal);
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [items, activeFilter, search, searchFilter, colFilters, sortBy, sortDir]);

  const currentItem = useMemo(() => {
    if (isNew || !id) return null;
    return items.find((i) => i.id === id) || null;
  }, [isNew, id, items]);

  const navInfo = useMemo(() => {
    if (isNew || !currentItem) return { prev: null, next: null };
    const idx = sorted.findIndex((i) => i.id === currentItem.id);
    return {
      prev: idx > 0 ? sorted[idx - 1]!.id : null,
      next: idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1]!.id : null,
    };
  }, [isNew, currentItem, sorted]);

  const [form, setForm] = useState<Record<string, string>>({});
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (isNew || !currentItem) {
      setForm(getDefaults(null));
      setIsActive(true);
      return;
    }
    setForm(getDefaults(currentItem));
    setIsActive(currentItem.is_active);
  }, [isNew, currentItem, getDefaults]);

  useEffect(() => {
    if (!loading && !isNew && id && !currentItem) {
      navigate(basePath, { replace: true });
    }
  }, [loading, isNew, id, currentItem, navigate, basePath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isNew) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft' && navInfo.prev) navigate(`${basePath}/${navInfo.prev}`, { state: location.state });
      if (e.key === 'ArrowRight' && navInfo.next) navigate(`${basePath}/${navInfo.next}`, { state: location.state });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isNew, navInfo.prev, navInfo.next, navigate, basePath, location.state]);

  const singular = title.replace(/s$/, '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (isNew) {
        await createItem(form);
        await load();
        navigate(basePath);
      } else if (currentItem) {
        await updateItem(currentItem.id, { ...form, is_active: isActive });
        await load();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errorOccurred'));
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  if (loading) return <Spinner />;
  if (!isNew && !currentItem) return <Navigate to={basePath} replace />;

  return (
    <>
      <PageHeader
        title={isNew ? t('create', { entity: singular }) : t('edit', { entity: singular })}
        description={!isNew && (navInfo.prev || navInfo.next) ? t('navigateRecords') : undefined}
        action={
          <div className="flex items-center gap-2">
            {!isNew && (
              <>
                <button
                  type="button"
                  disabled={!navInfo.prev}
                  onClick={() => navInfo.prev && navigate(`${basePath}/${navInfo.prev}`, { state: location.state })}
                  className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={t('previousEntity', { entity: singular.toLowerCase() })}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={!navInfo.next}
                  onClick={() => navInfo.next && navigate(`${basePath}/${navInfo.next}`, { state: location.state })}
                  className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={t('nextEntity', { entity: singular.toLowerCase() })}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => navigate(basePath)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('backToList')}
            </button>
          </div>
        }
      />

      <Card className="max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}
          {fields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                {field.label}{field.required ? ' *' : ''}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  value={form[field.key] || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                />
              ) : field.type === 'select' ? (
                <select
                  required={field.required}
                  value={form[field.key] || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                >
                  {(field.options || []).map((opt) => (
                    <option key={`${field.key}:${opt.value || '__empty__'}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  required={field.required}
                  value={form[field.key] || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              )}
            </div>
          ))}

          {!isNew && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">{tFields('status')}</label>
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-gray-200 rounded-full peer-checked:bg-indigo-600 transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
                </div>
                <span className="text-sm text-gray-700">{isActive ? tStates('active') : tStates('inactive')}</span>
              </label>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate(basePath)}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            >
              {tActions('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? tActions('saving') : isNew ? t('create', { entity: singular }) : tMaster('saveChanges')}
            </button>
          </div>
        </form>
      </Card>
    </>
  );
}
