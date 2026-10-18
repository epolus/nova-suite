/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { auth } from '../api/client';

export function UserRefPicker({ id, name, ariaLabel, value, onChange, placeholder }: {
  id: string;
  name: string;
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const t = useTranslations('components.dynamicFormField');
  const [inputText, setInputText] = useState('');
  const [users, setUsers] = useState<{ id: string; display_name: string; email: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    auth.users().then((res) => {
      const all = res.users.map((u: { id: string; display_name?: string; email: string }) => ({
        id: u.id,
        display_name: u.display_name || u.email,
        email: u.email,
      }));
      setUsers(all);
      setLoaded(true);
      if (value) {
        const found = all.find((u) => u.id === value);
        if (found) {
          const label = `${found.display_name} (${found.email})`;
          setSelectedLabel(label);
          setInputText(label);
        }
      }
    }).catch(() => setLoaded(true));
    // Load the user list once on mount; the initial value is resolved here too
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

  const filtered = inputText && open
    ? users.filter((u) => u.display_name.toLowerCase().includes(inputText.toLowerCase()) || u.email.toLowerCase().includes(inputText.toLowerCase()))
    : users;

  const handleFocus = () => {
    setOpen(true);
    if (value && selectedLabel) setInputText('');
  };

  const handleSelect = (u: { id: string; display_name: string; email: string }) => {
    const label = `${u.display_name} (${u.email})`;
    onChange(u.id);
    setSelectedLabel(label);
    setInputText(label);
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
          placeholder={placeholder || t('searchUser')}
          className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden"
        />
        {value && !open && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
          >&times;</button>
        )}
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-auto">
          {!loaded ? (
            <div className="px-3 py-3 text-xs text-gray-400 text-center">{t('loadingUsers')}</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-400 text-center">
              {inputText ? t('noUserMatching', { query: inputText }) : t('noUserFound')}
            </div>
          ) : (
            filtered.slice(0, 25).map((u) => (
              <button
                key={u.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(u)}
                className={`w-full text-left px-3 py-2.5 text-sm hover:bg-indigo-50 flex items-center justify-between border-b border-gray-50 last:border-0 transition-colors ${
                  u.id === value ? 'bg-indigo-50' : ''
                }`}
              >
                <span className="font-medium text-gray-900 truncate">{u.display_name}</span>
                <span className="text-xs text-gray-400 shrink-0 ml-2">{u.email}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
