/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import SearchBar from '../../components/SearchBar';
import Spinner from '../../components/Spinner';
import DataTable, { type DataColumnDef } from '../../components/DataTable';
import { useListParams } from '../../hooks/useListParams';

// ─── Types ───

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
}

export interface ColumnDef<T> {
  key: string;
  label: string;
  render: (item: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
  defaultVisible?: boolean;
}

interface MasterDataPageProps<T extends { id: string; is_active: boolean }> {
  title: string;
  description: string;
  storageKey?: string;
  detailBasePath?: string;
  columns: ColumnDef<T>[];
  fields: FieldDef[];
  fetchItems: () => Promise<T[]>;
  createItem: (data: Record<string, unknown>) => Promise<unknown>;
  updateItem: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  getDefaults: (item: T | null) => Record<string, string>;
  searchFilter: (item: T, query: string) => boolean;
}

export default function MasterDataPage<T extends { id: string; is_active: boolean }>({
  title,
  description,
  storageKey,
  detailBasePath,
  columns,
  fields,
  fetchItems,
  createItem,
  updateItem,
  getDefaults,
  searchFilter,
}: MasterDataPageProps<T>) {
  const navigate = useNavigate();
  // Build the full column list: user-defined columns + the always-present "Status" column
  const allColumns: DataColumnDef<T>[] = useMemo(() => {
    const mapped: DataColumnDef<T>[] = columns.map((col) => ({
      key: col.key,
      label: col.label,
      render: col.render,
      className: col.className,
      sortable: col.sortable ?? true,
      defaultVisible: col.defaultVisible ?? true,
    }));
    mapped.push({
      key: '_status',
      label: 'Status',
      sortable: true,
      defaultVisible: true,
      render: (item: T) =>
        item.is_active ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            Inactive
          </span>
        ),
    });
    return mapped;
  }, [columns]);

  const defaultCols = useMemo(
    () => allColumns.filter((c) => c.defaultVisible !== false).map((c) => c.key),
    [allColumns],
  );

  const { params, setSearch, setSort, setCols, setFilter, setColumnFilter } = useListParams({
    defaultCols,
    filterKeys: ['active'],
    storageKey,
  });

  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalItem, setModalItem] = useState<T | 'new' | null>(null);

  const activeFilter = params.filters.active || 'all';

  const load = useCallback(async () => {
    try {
      const data = await fetchItems();
      setItems(data);
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchItems]);

  useEffect(() => {
    load();
  }, [load]);

  // Filter
  const filtered = useMemo(() => {
    let list = items;
    if (activeFilter === 'active') list = list.filter((i) => i.is_active);
    else if (activeFilter === 'inactive') list = list.filter((i) => !i.is_active);
    if (params.search) list = list.filter((i) => searchFilter(i, params.search.toLowerCase()));

    // Per-column "starts with" filters (client-side)
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (!val) continue;
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

    return list;
  }, [items, activeFilter, params.search, searchFilter, params.columnFilters]);

  // Client-side sort
  const sorted = useMemo(() => {
    if (!params.sort) return filtered;
    const col = allColumns.find((c) => c.key === params.sort);
    if (!col) return filtered;

    return [...filtered].sort((a, b) => {
      const aVal = getNestedValue(a, params.sort);
      const bVal = getNestedValue(b, params.sort);
      const cmp = compareValues(aVal, bVal);
      return params.dir === 'desc' ? -cmp : cmp;
    });
  }, [filtered, params.sort, params.dir, allColumns]);

  const handleSaved = () => {
    setModalItem(null);
    setLoading(true);
    load();
  };

  const handleNavigate = (itemId: string) => {
    const target = sorted.find((i) => i.id === itemId);
    if (target) setModalItem(target);
  };

  const navInfo = useMemo(() => {
    if (!modalItem || modalItem === 'new') return { prev: null, next: null };
    const idx = sorted.findIndex((i) => i.id === modalItem.id);
    return {
      prev: idx > 0 ? sorted[idx - 1]!.id : null,
      next: idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1]!.id : null,
    };
  }, [modalItem, sorted]);

  const getListParams = useCallback((): Record<string, string> => {
    const lp: Record<string, string> = {};
    if (activeFilter && activeFilter !== 'all') lp.active = activeFilter;
    if (params.search) lp.search = params.search;
    if (params.sort) {
      lp.sort_by = params.sort;
      lp.sort_dir = params.dir;
    }
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (val) lp[`cf.${col}`] = val;
    }
    return lp;
  }, [activeFilter, params.search, params.sort, params.dir, params.columnFilters]);

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        action={
          <button
            onClick={() => {
              if (detailBasePath) {
                navigate(`${detailBasePath}/new`, { state: { listParams: getListParams() } });
              } else {
                setModalItem('new');
              }
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + New
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar
            value={params.search}
            onChange={setSearch}
            placeholder={`Search ${title.toLowerCase()}...`}
          />
        </div>
        <div className="flex gap-2 items-center">
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter('active', f === 'all' ? '' : f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${
                (activeFilter === f || (f === 'all' && !activeFilter))
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="ml-auto text-sm text-gray-500 self-center">
          {sorted.length} item{sorted.length !== 1 ? 's' : ''}
        </div>
      </div>

      <DataTable
        columns={allColumns}
        data={sorted}
        visibleColumns={params.cols}
        onColumnsChange={setCols}
        sortKey={params.sort}
        sortDir={params.dir}
        onSort={setSort}
        columnFilters={params.columnFilters}
        onColumnFilter={setColumnFilter}
        emptyMessage={params.search ? `No results for "${params.search}"` : `No ${title.toLowerCase()} found.`}
        onRowClick={
          detailBasePath
            ? (item) => navigate(`${detailBasePath}/${item.id}`, { state: { listParams: getListParams() } })
            : undefined
        }
        rowActions={
          detailBasePath
            ? undefined
            : (item) => (
                <button
                  onClick={() => setModalItem(item)}
                  className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                >
                  Edit
                </button>
              )
        }
      />

      {!detailBasePath && modalItem !== null && (
        <FormModal
          key={modalItem === 'new' ? 'new' : modalItem.id}
          item={modalItem === 'new' ? null : modalItem}
          fields={fields}
          getDefaults={getDefaults}
          createItem={createItem}
          updateItem={updateItem}
          onNavigate={handleNavigate}
          prevItemId={navInfo.prev}
          nextItemId={navInfo.next}
          onClose={() => setModalItem(null)}
          onSaved={handleSaved}
          title={title.replace(/s$/, '')}
        />
      )}
    </>
  );
}

// ─── Helpers ───

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

// ─── Generic Form Modal ───

interface FormModalProps<T extends { id: string; is_active: boolean }> {
  item: T | null;
  fields: FieldDef[];
  getDefaults: (item: T | null) => Record<string, string>;
  createItem: (data: Record<string, unknown>) => Promise<unknown>;
  updateItem: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  onNavigate: (itemId: string) => void;
  prevItemId?: string | null;
  nextItemId?: string | null;
  onClose: () => void;
  onSaved: () => void;
  title: string;
}

function FormModal<T extends { id: string; is_active: boolean }>({
  item,
  fields,
  getDefaults,
  createItem,
  updateItem,
  onNavigate,
  prevItemId,
  nextItemId,
  onClose,
  onSaved,
  title,
}: FormModalProps<T>) {
  const isNew = !item;
  const [form, setForm] = useState<Record<string, string>>(() => getDefaults(item));
  const [isActive, setIsActive] = useState(item?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isNew) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft' && prevItemId) onNavigate(prevItemId);
      if (e.key === 'ArrowRight' && nextItemId) onNavigate(nextItemId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isNew, prevItemId, nextItemId, onNavigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (isNew) {
        await createItem(form);
      } else {
        await updateItem(item.id, { ...form, is_active: isActive });
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4">
        <form onSubmit={handleSubmit}>
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {isNew ? `Create ${title}` : `Edit ${title}`}
              </h2>
              {!isNew && (prevItemId || nextItemId) && (
                <p className="text-xs text-gray-500 mt-0.5">Use &larr; / &rarr; to navigate records</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isNew && (
                <>
                  <button
                    type="button"
                    disabled={!prevItemId}
                    onClick={() => prevItemId && onNavigate(prevItemId)}
                    className="p-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={`Previous ${title.toLowerCase()} (Left Arrow)`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled={!nextItemId}
                    onClick={() => nextItemId && onNavigate(nextItemId)}
                    className="p-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={`Next ${title.toLowerCase()} (Right Arrow)`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </>
              )}
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
                &times;
              </button>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
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
                <label className="block text-sm font-medium text-gray-600 mb-2">Status</label>
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
                  <span className="text-sm text-gray-700">
                    {isActive ? 'Active' : 'Inactive'}
                  </span>
                </label>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-100 px-6 py-4 rounded-b-2xl flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : isNew ? `Create ${title}` : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
