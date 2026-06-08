/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import PageHeader from '../../components/PageHeader';
import SearchBar from '../../components/SearchBar';
import Spinner from '../../components/Spinner';
import DataTable, { type DataColumnDef } from '../../components/DataTable';
import { useListParams } from '../../hooks/useListParams';
import MasterDataFormModal from './master-data/MasterDataFormModal';
import { compareValues, getNestedValue, type ColumnDef } from './master-data/types';
import type { FieldDef } from './master-data/types';

export type { ColumnDef, FieldDef } from './master-data/types';

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
  const tMaster = useTranslations('common.masterData');
  const tFields = useTranslations('common.fields');
  const tStates = useTranslations('common.states');
  const entityLabel = title.replace(/s$/, '');
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
      label: tFields('status'),
      sortable: true,
      defaultVisible: true,
      render: (item: T) =>
        item.is_active ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            {tMaster('activeStatus')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            {tMaster('inactiveStatus')}
          </span>
        ),
    });
    return mapped;
  }, [columns, tFields, tMaster]);

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
            {tMaster('newButton')}
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <SearchBar
            value={params.search}
            onChange={setSearch}
            placeholder={tMaster('searchEntity', { entity: title.toLowerCase() })}
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
              {f === 'all' ? tStates('all') : f === 'active' ? tStates('active') : tStates('inactive')}
            </button>
          ))}
        </div>
        <div className="ml-auto text-sm text-gray-500 self-center">
          {tMaster('itemCount', { count: sorted.length })}
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
        emptyMessage={
          params.search
            ? tMaster('noResultsFor', { query: params.search })
            : tMaster('noEntityFound', { entity: title.toLowerCase() })
        }
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
                  {tMaster('edit')}
                </button>
              )
        }
      />

      {!detailBasePath && modalItem !== null && (
        <MasterDataFormModal
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
          entityLabel={entityLabel}
        />
      )}
    </>
  );
}
