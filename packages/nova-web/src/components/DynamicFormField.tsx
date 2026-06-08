/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'use-intl';
import type { FormField } from '../api/client';
import { cmdb, auth } from '../api/client';
import UserDateInput from './UserDateInput';

interface Props {
  field: FormField;
  value: string;
  onChange: (value: string) => void;
}

export default function DynamicFormField({ field, value, onChange }: Props) {
  const t = useTranslations('components.dynamicFormField');
  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {field.type !== 'checkbox' && (field.label || field.name)}
        {field.required && field.type !== 'checkbox' && <span className="text-red-500 ml-1">*</span>}
      </label>

      {field.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={field.placeholder}
          className={`${inputClass} resize-none`}
        />
      ) : field.type === 'select' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">{field.placeholder || t('select')}</option>
          {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : field.type === 'multiselect' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
          multiple
        >
          {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : field.type === 'number' ? (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={field.min}
          max={field.max}
          placeholder={field.placeholder}
          className={inputClass}
        />
      ) : field.type === 'email' ? (
        <input
          type="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || t('emailPlaceholder')}
          pattern={field.pattern}
          className={inputClass}
        />
      ) : field.type === 'checkbox' ? (
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={value === 'true'}
            onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
            className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
          />
          {field.label || field.name}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      ) : field.type === 'cmdb_ref' ? (
        <CmdbRefPicker value={value} onChange={onChange} ciClass={field.ci_class} ciFilter={field.ci_filter} placeholder={field.placeholder} />
      ) : field.type === 'user_ref' ? (
        <UserRefPicker value={value} onChange={onChange} placeholder={field.placeholder} />
      ) : field.type === 'date' ? (
        <UserDateInput
          value={value}
          onChange={onChange}
          className={inputClass}
          disallowPast
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={inputClass}
        />
      )}

      {field.helpText && (
        <p className="text-xs text-gray-400 mt-1">{field.helpText}</p>
      )}
    </div>
  );
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/* ─── CMDB Reference Picker ─── */
function CmdbRefPicker({ value, onChange, ciClass, ciFilter, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  ciClass?: string;
  ciFilter?: Record<string, string>;
  placeholder?: string;
}) {
  const t = useTranslations('components.dynamicFormField');
  const tStates = useTranslations('common.states');
  const [inputText, setInputText] = useState('');
  const [options, setOptions] = useState<{ id: string; name: string; class_name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [resolved, setResolved] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounce(inputText, 250);

  const buildParams = useCallback((q?: string): Record<string, string> => {
    const params: Record<string, string> = { context: 'picker', status: 'active' };
    if (q) params.search = q;
    if (ciClass) params.class = ciClass;
    if (ciFilter) {
      for (const [k, v] of Object.entries(ciFilter)) {
        if (v) params[k] = v;
      }
    }
    return params;
  }, [ciClass, ciFilter]);

  // Resolve the initial UUID to a display name
  useEffect(() => {
    if (value && !resolved) {
      cmdb.items(buildParams(), 1, 200).then((res) => {
        const found = res.items.find((ci: any) => ci.id === value);
        if (found) {
          const label = `${found.name} (${(found as any).class_display_name || (found as any).class_name || ''})`;
          setSelectedLabel(label);
          setInputText(label);
        }
        setResolved(true);
      }).catch(() => setResolved(true));
    } else if (!value) {
      setSelectedLabel('');
      setInputText('');
      setResolved(true);
    }
  }, [value, buildParams, resolved]);

  // Fetch matching CIs when debounced search changes
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    cmdb.items(buildParams(debouncedSearch), 1, 25).then((res) => {
      setOptions(res.items.map((ci: any) => ({
        id: ci.id,
        name: ci.name,
        class_name: (ci as any).class_display_name || (ci as any).class_name || '',
      })));
    }).catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [debouncedSearch, open, buildParams]);

  // Close dropdown when clicking outside
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

  const handleFocus = () => {
    setOpen(true);
    if (value && selectedLabel) {
      setInputText('');
    }
  };

  const handleSelect = (ci: { id: string; name: string; class_name: string }) => {
    const label = `${ci.name} (${ci.class_name})`;
    onChange(ci.id);
    setSelectedLabel(label);
    setInputText(label);
    setOpen(false);
    setResolved(true);
  };

  const handleClear = () => {
    onChange('');
    setSelectedLabel('');
    setInputText('');
    setResolved(true);
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          value={inputText}
          onChange={(e) => { setInputText(e.target.value); if (!open) setOpen(true); }}
          onFocus={handleFocus}
          placeholder={placeholder || t('searchCi', { suffix: ciClass ? t('searchCiSuffix', { class: ciClass }) : '' })}
          className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        />
        {value && !open && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
          >&times;</button>
        )}
        {loading && open && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        )}
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-auto">
          {loading && options.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-400 text-center">{tStates('loading')}</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-400 text-center">
              {inputText ? t('noCiMatching', { query: inputText }) : t('noCiFound')}
            </div>
          ) : (
            options.map((ci) => (
              <button
                key={ci.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(ci)}
                className={`w-full text-left px-3 py-2.5 text-sm hover:bg-indigo-50 flex items-center justify-between border-b border-gray-50 last:border-0 transition-colors ${
                  ci.id === value ? 'bg-indigo-50' : ''
                }`}
              >
                <div className="min-w-0">
                  <span className="font-medium text-gray-900 block truncate">{ci.name}</span>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{ci.class_name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ─── User Reference Picker ─── */
function UserRefPicker({ value, onChange, placeholder }: {
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
      const all = res.users.map((u: any) => ({
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

  // Close dropdown when clicking outside
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
          value={inputText}
          onChange={(e) => { setInputText(e.target.value); if (!open) setOpen(true); }}
          onFocus={handleFocus}
          placeholder={placeholder || t('searchUser')}
          className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
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
                <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{u.email}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
