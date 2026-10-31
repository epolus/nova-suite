/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from 'use-intl';
import { catalog } from '../../api/client';
import type { ServiceItem, Category } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import DataTable from '../../components/DataTable';
import { useListParams } from '../../hooks/useListParams';
import { useTheme } from '../../context/ThemeContext';
import ServiceItemForm from './ServiceItemForm';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import {
  buildServiceItemColumns,
  compareServiceItemValues,
  serviceItemSortValue,
  withServiceItemListMeta,
} from './serviceItemColumns';

const DEFAULT_COLS = ['name', 'category_name', 'short_description', 'price', 'task_count', '_status'];
const PAGE_SIZE = 25;

export default function ServiceItemsPage() {
  const t = useTranslations('pages.admin.serviceItems');
  const tActions = useTranslations('common.actions');
  const tStates = useTranslations('common.states');
  const tFields = useTranslations('common.fields');
  const tTable = useTranslations('common.table');
  const tMaster = useTranslations('common.masterData');
  const { theme } = useTheme();
  const { params, setSearch, setSort, setCols, setPage, setFilter, setColumnFilter } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['active'],
    storageKey: 'admin_service_items',
  });

  const [items, setItems] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ServiceItem | null>(null);

  useEffect(() => {
    if (!creating && !editing) return;
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest('a');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== '_self') return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || url.pathname !== '/admin/service-items') return;
      setEditing(null);
      setCreating(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [creating, editing]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      catalog.allItems(),
      catalog.categories(),
    ]).then(([itemsRes, catsRes]) => {
      if (cancelled) return;
      setItems(itemsRes.items);
      setCategories(catsRes.categories);
    }).catch(() => {
      if (!cancelled) setLoadError(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const activeFilter = params.filters.active || 'all';

  const filtered = useMemo(() => {
    let list = items;
    if (activeFilter === 'active') list = list.filter((item) => item.is_active);
    else if (activeFilter === 'inactive') list = list.filter((item) => !item.is_active);

    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter((item) =>
        item.name.toLowerCase().includes(q) ||
        (item.short_description && item.short_description.toLowerCase().includes(q)) ||
        (item.category_name && item.category_name.toLowerCase().includes(q)),
      );
    }

    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (!val) continue;
      const lower = val.toLowerCase();
      list = list.filter((item) => {
        if (col === '_status') return (item.is_active ? 'active' : 'inactive').startsWith(lower);
        if (col === 'approval_required') return (item.approval_required ? 'yes' : 'no').startsWith(lower);
        if (col === 'task_count') return String(item.task_count ?? 0).startsWith(lower);
        const raw = serviceItemSortValue(item, col);
        return raw != null && String(raw).toLowerCase().startsWith(lower);
      });
    }
    return list;
  }, [items, activeFilter, params.search, params.columnFilters]);

  const sorted = useMemo(() => {
    if (!params.sort) return filtered;
    return [...filtered].sort((a, b) => {
      const cmp = compareServiceItemValues(serviceItemSortValue(a, params.sort), serviceItemSortValue(b, params.sort));
      return params.dir === 'desc' ? -cmp : cmp;
    });
  }, [filtered, params.sort, params.dir]);

  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(params.page, pages);
  const pageRows = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sorted, page],
  );

  useEffect(() => {
    if (params.page !== page) setPage(page);
  }, [params.page, page, setPage]);

  const columns = useMemo(
    () => buildServiceItemColumns(t, tFields, tTable, tStates, theme.catalog_currency),
    [t, tFields, tTable, tStates, theme.catalog_currency],
  );

  const handleSaved = (item: ServiceItem) => {
    const previous = items.find((i) => i.id === item.id);
    const next = withServiceItemListMeta(item, categories, previous);
    if (creating) {
      setItems([...items, next]);
      setCreating(false);
    } else {
      setItems(items.map((i) => (i.id === item.id ? next : i)));
      setEditing(null);
    }
  };

  const handleDeactivate = useCallback(async (id: string) => {
    if (!confirm(t('confirmDeactivate'))) return;
    setActionError(null);
    setBusyId(id);
    try {
      await catalog.deleteItem(id);
      setItems((current) => current.map((i) => (i.id === id ? { ...i, is_active: false } : i)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('deleteFailed'));
    } finally {
      setBusyId(null);
    }
  }, [t]);

  const handlePermanentDelete = useCallback(async () => {
    const item = pendingDelete;
    if (!item) return;
    setActionError(null);
    setBusyId(item.id);
    try {
      const result = await catalog.deleteItem(item.id, { permanent: true });
      if (!result.success) {
        setActionError(result.error || t('deleteFailed'));
        return;
      }
      setItems((current) => current.filter((i) => i.id !== item.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('deleteFailed'));
    } finally {
      setBusyId(null);
      setPendingDelete(null);
    }
  }, [pendingDelete, t]);

  const rowActions = useCallback((item: ServiceItem) => {
    const busy = busyId === item.id;
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(item)}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        >
          {tActions('edit')}
        </button>
        {item.is_active ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => handleDeactivate(item.id)}
            className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
          >
            {tMaster('deactivate')}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setPendingDelete(item)}
            className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
          >
            {tActions('delete')}
          </button>
        )}
      </div>
    );
  }, [busyId, handleDeactivate, tActions, tMaster]);

  const editingIndex = editing ? sorted.findIndex((item) => item.id === editing.id) : -1;
  const prevItemId = editingIndex > 0 ? sorted[editingIndex - 1]?.id ?? null : null;
  const nextItemId = editingIndex >= 0 && editingIndex < sorted.length - 1
    ? sorted[editingIndex + 1]?.id ?? null
    : null;

  if (creating || editing) {
    return (
      <ServiceItemForm
        key={editing?.id ?? 'new'}
        item={editing || undefined}
        categories={categories}
        currencyCode={theme.catalog_currency}
        prevItemId={prevItemId}
        nextItemId={nextItemId}
        onNavigate={(id) => {
          const next = sorted.find((item) => item.id === id);
          if (next) setEditing(next);
        }}
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

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar value={params.search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
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
              {f === 'all' ? tStates('all') : f === 'active' ? tStates('active') : tStates('inactive')}
            </button>
          ))}
        </div>
        <div className="ml-auto text-sm text-gray-500 self-center">
          {t('count', { count: total })}
        </div>
      </div>

      {actionError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start justify-between gap-3">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="shrink-0 text-red-500 hover:text-red-800 leading-none"
            aria-label={tActions('dismiss')}
          >
            &times;
          </button>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : loadError ? (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {t('loadFailed')}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={pageRows}
          visibleColumns={params.cols}
          onColumnsChange={setCols}
          sortKey={params.sort}
          sortDir={params.dir}
          onSort={setSort}
          columnFilters={params.columnFilters}
          onColumnFilter={setColumnFilter}
          emptyMessage={params.search ? t('emptySearch', { query: params.search }) : t('empty')}
          onRowClick={(item) => setEditing(item)}
          rowActions={rowActions}
          pagination={
            pages > 1
              ? { page, pages, total, onPageChange: setPage }
              : undefined
          }
        />
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        title={t('deleteTitle')}
        message={pendingDelete
          ? t('confirmDelete', { name: pendingDelete.name, count: pendingDelete.task_count ?? 0 })
          : ''}
        confirmLabel={tActions('delete')}
        variant="danger"
        loading={pendingDelete != null && busyId === pendingDelete.id}
        onConfirm={() => { void handlePermanentDelete(); }}
        onCancel={() => { if (busyId == null) setPendingDelete(null); }}
      />
    </>
  );
}
