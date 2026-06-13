/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import type { ServiceItem } from '../api/client';

const RECENT_STORAGE_KEY = 'nova_admin_recent_catalog_items';
const RECENT_MAX = 5;

function readRecentIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function pushRecentId(id: string): void {
  if (!id) return;
  const prev = readRecentIds().filter((x) => x !== id);
  prev.unshift(id);
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(prev.slice(0, RECENT_MAX)));
}

type Row = { type: 'section'; title: string } | { type: 'item'; item: ServiceItem };

interface Props {
  items: ServiceItem[];
  value: string;
  onChange: (id: string) => void;
  taskCounts?: Record<string, number>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function ServiceItemCombobox({
  items,
  value,
  onChange,
  taskCounts = {},
  placeholder,
  disabled = false,
  className = '',
}: Props) {
  const t = useTranslations('components.serviceItemCombobox');
  const resolvedPlaceholder = placeholder ?? t('selectPlaceholder');
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);

  const selected = useMemo(() => items.find((i) => i.id === value), [items, value]);

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        const c = (a.category_name || '').localeCompare(b.category_name || '');
        if (c !== 0) return c;
        return (a.name || '').localeCompare(b.name || '');
      }),
    [items],
  );

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = sortedItems;
    if (q) {
      list = sortedItems.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.category_name || '').toLowerCase().includes(q) ||
          (i.short_description && i.short_description.toLowerCase().includes(q)),
      );
    }
    if (value && !list.some((i) => i.id === value)) {
      const sel = sortedItems.find((i) => i.id === value);
      if (sel) list = [sel, ...list];
    }
    return list;
  }, [sortedItems, query, value]);

  const rows = useMemo((): Row[] => {
    const q = query.trim();
    const recentIds = readRecentIds();
    const recentItems = recentIds
      .map((id) => items.find((i) => i.id === id))
      .filter((x): x is ServiceItem => Boolean(x));

    const out: Row[] = [];
    if (!q && recentItems.length > 0) {
      out.push({ type: 'section', title: 'Recent' });
      for (const item of recentItems) out.push({ type: 'item', item });
    }

    const recentSet = new Set(recentItems.map((r) => r.id));
    const rest = q ? filteredItems : filteredItems.filter((i) => !recentSet.has(i.id));

    const byCat = new Map<string, ServiceItem[]>();
    for (const i of rest) {
      const cat = i.category_name || 'Uncategorized';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(i);
    }
    const cats = Array.from(byCat.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    if (cats.length === 0 && recentItems.length > 0 && !q) {
      return out;
    }

    const sectionTitle = !q && recentItems.length > 0 ? 'All items' : 'Service items';
    if (cats.length > 0) {
      out.push({ type: 'section', title: sectionTitle });
    }
    for (const [cat, list] of cats) {
      if (cats.length > 1 || q) {
        out.push({ type: 'section', title: cat });
      }
      for (const item of list) out.push({ type: 'item', item });
    }

    if (out.length === 0 && filteredItems.length > 0) {
      for (const item of filteredItems) out.push({ type: 'item', item });
    }
    return out;
  }, [items, filteredItems, query]);

  const itemIndices = useMemo(
    () => rows.map((r, i) => (r.type === 'item' ? i : -1)).filter((i) => i >= 0),
    [rows],
  );

  useEffect(() => {
    if (!open) return;
    const first = itemIndices[0];
    setHighlightIdx(first ?? 0);
  }, [open, query, rows, itemIndices]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = useCallback(
    (id: string) => {
      pushRecentId(id);
      onChange(id);
      setOpen(false);
      setQuery('');
    },
    [onChange],
  );

  const displayLabel = selected
    ? `${selected.name}${!selected.is_active ? ' (inactive)' : ''}`
    : '';

  const stepHighlight = (dir: 1 | -1) => {
    if (itemIndices.length === 0) return;
    const pos = itemIndices.indexOf(highlightIdx);
    const at = pos < 0 ? 0 : pos;
    const next = (at + dir + itemIndices.length) % itemIndices.length;
    setHighlightIdx(itemIndices[next]!);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      stepHighlight(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      stepHighlight(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[highlightIdx];
      if (row?.type === 'item') pick(row.item.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-900 shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
      >
        <span className={selected ? 'truncate font-medium' : 'truncate text-gray-400'}>
          {selected ? displayLabel : resolvedPlaceholder}
        </span>
        <span className="flex-shrink-0 text-gray-400" aria-hidden>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          <div className="border-b border-gray-100 px-2 py-2">
            <input
              ref={inputRef}
              type="text"
              name="service-item-filter"
              aria-label={t('filterPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder={t('filterPlaceholder')}
              className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {rows.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-gray-400">{t('noMatches')}</div>
          ) : (
            rows.map((row, idx) => {
              if (row.type === 'section') {
                return (
                  <div key={`s-${row.title}-${idx}`} className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    {row.title}
                  </div>
                );
              }
              const item = row.item;
              const count = taskCounts[item.id] ?? 0;
              const active = idx === highlightIdx;
              return (
                <button
                  key={`${item.id}-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={value === item.id}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  onClick={() => pick(item.id)}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors ${
                    active ? 'bg-indigo-50 text-indigo-900' : 'text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <span className="flex w-full min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{item.name}</span>
                    {!item.is_active && (
                      <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                        inactive
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-gray-500">
                    {item.category_name || 'Uncategorized'}
                    {' · '}
                    {count === 0 ? 'No tasks' : `${count} task${count === 1 ? '' : 's'}`}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
