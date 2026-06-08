/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { useAuth } from '../../context/AuthContext';
import { search as searchApi, type SearchResult } from '../../api/client';

const TYPE_ICON: Record<string, string> = {
  incident: '🔥',
  change:   '🛠️',
  problem:  '🧩',
  knowledge:'📚',
  ci:       '🖥️',
};

function useGreeting(name: string): string {
  const t = useTranslations('pages.ess.home');
  const hour = new Date().getHours();
  if (hour < 12) return t('goodMorning', { name });
  if (hour < 17) return t('goodAfternoon', { name });
  return t('goodEvening', { name });
}

function ESSSearchBar() {
  const t = useTranslations('pages.ess.home');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const typeLabel = useCallback(
    (type: string) => {
      const key = type as 'incident' | 'change' | 'problem' | 'knowledge' | 'ci';
      if (key in TYPE_ICON) return t(`searchTypes.${key}`);
      return type;
    },
    [t],
  );

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setSearchError('');
      return;
    }
    setLoading(true);
    setSearchError('');
    try {
      const { results: r } = await searchApi.query(q, 8);
      setResults(r);
      setActiveIndex(0);
    } catch (err: unknown) {
      setResults([]);
      setSearchError(err instanceof Error ? err.message : t('searchFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleChange = (q: string) => {
    setQuery(q);
    setSearchError('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 250);
  };

  const handleSelect = (r: SearchResult) => {
    navigate(r.path);
    setQuery('');
    setResults([]);
    setFocused(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[activeIndex];
      if (r) handleSelect(r);
    } else if (e.key === 'Escape') {
      setFocused(false);
    }
  };

  const showDropdown = focused && query.length >= 2 && (loading || results.length > 0 || !!searchError);

  return (
    <div ref={wrapperRef} className="relative w-full max-w-2xl mx-auto">
      <div className="relative">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          {loading ? (
            <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </div>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={t('searchPlaceholder')}
          className="w-full pl-12 pr-4 py-4 text-base rounded-2xl border border-gray-200 shadow-md focus:outline-none focus:ring-2 focus:border-transparent bg-white placeholder-gray-400 text-gray-900"
          style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
        />
      </div>

      {showDropdown && (
        <div className="absolute top-full mt-2 w-full bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
          {searchError ? (
            <p className="px-4 py-6 text-sm text-red-600 text-center">{searchError}</p>
          ) : loading && results.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">{t('searching')}</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">
              {t('noResultsFor', { query })}
            </p>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => handleSelect(r)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  activeIndex === i ? 'bg-indigo-50' : 'hover:bg-gray-50'
                } ${i < results.length - 1 ? 'border-b border-gray-50' : ''}`}
              >
                <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">
                  {TYPE_ICON[r.type] ?? '📄'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      {typeLabel(r.type)}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">{r.identifier}</span>
                  </div>
                  <p className={`text-sm font-medium truncate ${activeIndex === i ? 'text-indigo-700' : 'text-gray-800'}`}>
                    {r.title}
                  </p>
                  {r.subtitle && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{r.subtitle}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface QuickCard {
  labelKey: 'catalog' | 'requests' | 'knowledge';
  path: string;
  icon: React.ReactNode;
  color: string;
}

const quickCardDefs: QuickCard[] = [
  {
    labelKey: 'catalog',
    path: '/catalog',
    color: 'bg-violet-500',
    icon: (
      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    labelKey: 'requests',
    path: '/requests',
    color: 'bg-sky-500',
    icon: (
      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    labelKey: 'knowledge',
    path: '/knowledge',
    color: 'bg-emerald-500',
    icon: (
      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
];

export default function ESSHomePage() {
  const t = useTranslations('pages.ess.home');
  const tActions = useTranslations('common.actions');
  const { user } = useAuth();
  const navigate = useNavigate();

  const displayName = user?.display_name?.split(' ')[0] ?? t('defaultName');
  const greeting = useGreeting(displayName);

  return (
    <div className="flex flex-col">
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-indigo-950 text-white">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(var(--color-primary) 1px, transparent 1px), linear-gradient(to right, var(--color-primary) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 flex flex-col items-center text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
            {greeting}
          </h1>
          <p className="text-slate-400 text-base mb-10">
            {t('helpToday')}
          </p>
          <ESSSearchBar />
        </div>
      </section>

      <section className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-10">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
          {t('quickAccess')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {quickCardDefs.map((card) => (
            <button
              key={card.path}
              onClick={() => navigate(card.path)}
              className="group text-left bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 transition-all duration-150"
            >
              <div className={`w-11 h-11 ${card.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform`}>
                {card.icon}
              </div>
              <p className="text-base font-semibold text-gray-900 mb-1">{t(`cards.${card.labelKey}.label`)}</p>
              <p className="text-sm text-gray-500 leading-snug">{t(`cards.${card.labelKey}.description`)}</p>
              <div className="mt-4 flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
                {tActions('open')}
                <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </section>

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 pb-12">
        <div className="rounded-xl bg-blue-50 border border-blue-100 px-5 py-4 flex items-start gap-3 dark:bg-slate-900/40 dark:border-slate-700">
          <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5 dark:text-sky-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-sky-100">{t('helpTitle')}</p>
            <p className="text-sm text-blue-600 mt-0.5 dark:text-sky-200/90">
              {t('helpBrowse')}{' '}
              <button onClick={() => navigate('/knowledge')} className="underline font-medium hover:text-blue-800 dark:hover:text-white">
                {t('helpKnowledgeLink')}
              </button>{' '}
              {t('helpMiddle')}{' '}
              <button onClick={() => navigate('/catalog')} className="underline font-medium hover:text-blue-800 dark:hover:text-white">
                {t('helpRequestLink')}
              </button>{' '}
              {t('helpEnd')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
