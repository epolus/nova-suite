/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import Card from './Card';
import EmptyState from './EmptyState';
import type { SortDir } from '../hooks/useListParams';

// ─── Types ───

export interface DataColumnDef<T> {
  key: string;
  label: string;
  render: (item: T) => ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  defaultVisible?: boolean;
  className?: string;
}

interface DataTableProps<T extends { id: string }> {
  columns: DataColumnDef<T>[];
  data: T[];
  visibleColumns: string[];
  onColumnsChange: (cols: string[]) => void;
  sortKey: string;
  sortDir: SortDir;
  onSort: (key: string) => void;
  columnFilters?: Record<string, string>;
  onColumnFilter?: (col: string, value: string) => void;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  rowActions?: (item: T) => ReactNode;
  pagination?: {
    page: number;
    pages: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

// ─── Component ───

export default function DataTable<T extends { id: string }>({
  columns,
  data,
  visibleColumns,
  onColumnsChange,
  sortKey,
  sortDir,
  onSort,
  columnFilters,
  onColumnFilter,
  emptyMessage = 'No data found.',
  onRowClick,
  rowActions,
  pagination,
  selectable,
  selectedIds = [],
  onSelectionChange,
}: DataTableProps<T>) {
  const visible = visibleColumns
    .map((key) => columns.find((c) => c.key === key))
    .filter(Boolean) as DataColumnDef<T>[];

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const selectAllRef = useRef<HTMLInputElement>(null);
  const allSelected = selectable && data.length > 0 && data.every((item) => selectedIds.includes(item.id));
  const someSelected = selectable && !allSelected && data.some((item) => selectedIds.includes(item.id));
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = !!someSelected;
  }, [someSelected]);
  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) onSelectionChange([]);
    else onSelectionChange(data.map((item) => item.id));
  };
  const toggleRow = (id: string) => {
    if (!onSelectionChange) return;
    if (selectedIds.includes(id)) onSelectionChange(selectedIds.filter((x) => x !== id));
    else onSelectionChange([...selectedIds, id]);
  };

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const newOrder = [...visibleColumns];
    const item = newOrder[dragIdx]!;
    newOrder.splice(dragIdx, 1);
    newOrder.splice(targetIdx, 0, item);
    onColumnsChange(newOrder);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const hasColumnFilters = onColumnFilter && visible.some((c) => c.filterable !== false);

  return (
    <Card padding={false}>
      {data.length === 0 && !hasColumnFilters ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {/* Header row */}
              <tr className="border-b border-gray-100 text-left">
                {selectable && (
                  <th className="pl-4 pr-2 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={!!allSelected}
                      onChange={toggleAll}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>
                )}
                {visible.map((col, idx) => (
                  <th
                    key={col.key}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={() => handleDrop(idx)}
                    onDragEnd={handleDragEnd}
                    className={`px-6 py-3 font-medium text-gray-500 select-none transition-colors ${
                      col.sortable ? 'cursor-pointer hover:text-gray-800' : 'cursor-grab'
                    } ${dragOverIdx === idx && dragIdx !== idx ? 'bg-indigo-50' : ''} ${
                      dragIdx === idx ? 'opacity-40' : ''
                    } ${col.className || ''}`}
                    onClick={col.sortable ? () => onSort(col.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      <svg className="w-3 h-3 text-gray-300 flex-shrink-0 mr-0.5" viewBox="0 0 12 12" fill="currentColor">
                        <circle cx="4" cy="3" r="1" /><circle cx="8" cy="3" r="1" />
                        <circle cx="4" cy="6" r="1" /><circle cx="8" cy="6" r="1" />
                        <circle cx="4" cy="9" r="1" /><circle cx="8" cy="9" r="1" />
                      </svg>
                      {col.label}
                      {col.sortable && <SortIcon active={sortKey === col.key} dir={sortKey === col.key ? sortDir : undefined} />}
                    </span>
                  </th>
                ))}
                {rowActions && <th className="px-6 py-3 font-medium text-gray-500 w-10" />}
                <th className="px-3 py-3 w-8">
                  <ColumnPicker
                    columns={columns}
                    visibleColumns={visibleColumns}
                    onChange={onColumnsChange}
                  />
                </th>
              </tr>

              {/* Column filter row */}
              {hasColumnFilters && (
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  {selectable && <th className="pl-4 pr-2 py-1.5" />}
                  {visible.map((col) => (
                    <th key={col.key} className="px-6 py-1.5">
                      {col.filterable !== false ? (
                        <ColumnFilterInput
                          value={columnFilters?.[col.key] || ''}
                          onChange={(v) => onColumnFilter!(col.key, v)}
                        />
                      ) : (
                        <span />
                      )}
                    </th>
                  ))}
                  {rowActions && <th className="px-6 py-1.5" />}
                  <th className="px-3 py-1.5" />
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={visible.length + (rowActions ? 1 : 0) + (selectable ? 1 : 0) + 1} className="py-12">
                    <EmptyState message={emptyMessage} />
                  </td>
                </tr>
              ) : (
                data.map((item) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-gray-50 transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${selectable && selectedIds.includes(item.id) ? 'bg-indigo-50/50' : ''}`}
                    onClick={onRowClick ? () => onRowClick(item) : undefined}
                  >
                    {selectable && (
                      <td className="pl-4 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleRow(item.id)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                    )}
                    {visible.map((col) => (
                      <td key={col.key} className={`px-6 py-3 ${col.className || ''}`}>
                        {col.render(item)}
                      </td>
                    ))}
                    {rowActions && (
                      <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
                        {rowActions(item)}
                      </td>
                    )}
                    <td className="px-3 py-3" />
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-500">{pagination.total} total</p>
          <div className="flex gap-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              className="px-3 py-1 text-sm border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40"
            >
              Prev
            </button>
            <span className="px-2 py-1 text-sm text-gray-500">
              {pagination.page} / {pagination.pages}
            </span>
            <button
              disabled={pagination.page >= pagination.pages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              className="px-3 py-1 text-sm border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Column Filter Input (debounced) ───

function ColumnFilterInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { setLocal(value); }, [value]);

  const handleChange = useCallback(
    (v: string) => {
      setLocal(v);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onChange(v), 350);
    },
    [onChange],
  );

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <input
      type="text"
      value={local}
      onChange={(e) => handleChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400 placeholder-gray-300"
      placeholder="Filter..."
    />
  );
}

// ─── Sort Icon ───

function SortIcon({ active, dir }: { active: boolean; dir?: SortDir }) {
  return (
    <svg className={`w-3.5 h-3.5 ${active ? 'text-indigo-600' : 'text-gray-300'}`} viewBox="0 0 14 14" fill="currentColor">
      {(!active || dir === 'asc') && (
        <path d="M7 2L11 7H3L7 2Z" opacity={active && dir === 'asc' ? 1 : 0.4} />
      )}
      {(!active || dir === 'desc') && (
        <path d="M7 12L3 7H11L7 12Z" opacity={active && dir === 'desc' ? 1 : 0.4} />
      )}
    </svg>
  );
}

// ─── Column Picker ───

function ColumnPicker<T>({
  columns,
  visibleColumns,
  onChange,
}: {
  columns: DataColumnDef<T>[];
  visibleColumns: string[];
  onChange: (cols: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (key: string) => {
    if (visibleColumns.includes(key)) {
      if (visibleColumns.length <= 1) return;
      onChange(visibleColumns.filter((k) => k !== key));
    } else {
      onChange([...visibleColumns, key]);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
        title="Configure columns"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
          <p className="px-3 pb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Visible Columns</p>
          {columns.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm text-gray-700"
            >
              <input
                type="checkbox"
                checked={visibleColumns.includes(col.key)}
                onChange={() => toggle(col.key)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
