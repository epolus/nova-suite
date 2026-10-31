/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { catalog } from '../api/client';

type LocationOption = { id: string; name: string; city: string | null; is_active: boolean };

export function LocationRefPicker({ id, name, ariaLabel, value, onChange, placeholder }: {
  id: string;
  name: string;
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const t = useTranslations('components.dynamicFormField');
  const [inputText, setInputText] = useState('');
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    catalog.locations().then((res) => {
      const all = res.locations.map((loc) => ({
        id: loc.id,
        name: loc.name,
        city: loc.city,
        is_active: loc.is_active,
      }));
      setLocations(all);
      setLoaded(true);
      if (value) {
        const found = all.find((loc) => loc.id === value);
        if (found) {
          setSelectedLabel(found.name);
          setInputText(found.name);
        }
      }
    }).catch(() => setLoaded(true));
    // Load once on mount; the initial value is resolved here too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (value && selectedLabel) setInputText(selectedLabel);
        else if (!value) setInputText('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [value, selectedLabel]);

  const active = locations.filter((loc) => loc.is_active);
  const filtered = inputText && open
    ? active.filter((loc) => loc.name.toLowerCase().includes(inputText.toLowerCase())
      || (loc.city ?? '').toLowerCase().includes(inputText.toLowerCase()))
    : active;

  const handleFocus = () => {
    setOpen(true);
    if (value && selectedLabel) setInputText('');
  };

  const handleSelect = (loc: LocationOption) => {
    onChange(loc.id);
    setSelectedLabel(loc.name);
    setInputText(loc.name);
    setOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setSelectedLabel('');
    setInputText('');
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          id={id}
          name={name}
          aria-label={ariaLabel}
          value={inputText}
          onChange={(e) => { setInputText(e.target.value); if (!open) setOpen(true); }}
          onFocus={handleFocus}
          placeholder={placeholder || t('searchLocation')}
          className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden"
        />
        {value && !open && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
          >&times;</button>
        )}
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-auto">
          {!loaded ? (
            <div className="px-3 py-3 text-xs text-gray-400 text-center">{t('loadingLocations')}</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-400 text-center">
              {inputText ? t('noLocationMatching', { query: inputText }) : t('noLocationFound')}
            </div>
          ) : (
            filtered.slice(0, 25).map((loc) => (
              <button
                key={loc.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(loc)}
                className={`w-full text-left px-3 py-2.5 text-sm hover:bg-indigo-50 flex items-center justify-between border-b border-gray-50 last:border-0 transition-colors ${
                  loc.id === value ? 'bg-indigo-50' : ''
                }`}
              >
                <span className="font-medium text-gray-900 truncate">{loc.name}</span>
                {loc.city && <span className="text-xs text-gray-400 shrink-0 ml-2">{loc.city}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
