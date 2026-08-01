/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { useFieldControl } from './ui/fieldControl';

interface Props<T> {
  items: T[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClear: () => void;
  getItemId: (item: T) => string;
  getDisplayText: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  filterFn?: (item: T, search: string) => boolean;
  fallbackDisplayText?: string;
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
  ariaLabel?: string;
}

export function SearchableDropdown<T>({
  items,
  selectedId,
  onSelect,
  onClear,
  getItemId,
  getDisplayText,
  renderItem,
  filterFn,
  fallbackDisplayText,
  placeholder,
  className,
  id,
  name,
  ariaLabel,
}: Props<T>) {
  const t = useTranslations('components.searchableDropdown');
  const tFilters = useTranslations('common.filters');
  const resolvedPlaceholder = placeholder ?? tFilters('searchPlaceholder');
  const field = useFieldControl(name, id);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedItem = items.find((i) => getItemId(i) === selectedId) ?? null;

  const filtered = search
    ? items
        .filter((i) =>
          filterFn
            ? filterFn(i, search)
            : getDisplayText(i).toLowerCase().includes(search.toLowerCase()),
        )
        .slice(0, 20)
    : items.slice(0, 20);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const displayValue = open
    ? search
    : selectedItem
      ? getDisplayText(selectedItem)
      : (fallbackDisplayText ?? '');

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <input
        id={field.id}
        name={field.name}
        type="text"
        value={displayValue}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={resolvedPlaceholder}
        aria-label={ariaLabel ?? resolvedPlaceholder}
        className={inputCls}
      />
      {selectedId && !open && (
        <button
          type="button"
          onClick={() => { onClear(); setSearch(''); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
        >
          &#10005;
        </button>
      )}
      {open && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">{t('noResults')}</p>
          ) : (
            filtered.map((item) => {
              const itemId = getItemId(item);
              return (
                <button
                  key={itemId}
                  type="button"
                  onClick={() => { onSelect(itemId); setSearch(''); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 ${itemId === selectedId ? 'bg-indigo-50 font-medium' : ''}`}
                >
                  {renderItem(item)}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
