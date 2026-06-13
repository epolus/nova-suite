/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { search as searchApi, type SearchResult } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isAdminRole } from '../utils/roles';
import { AppIcon } from './globalSearchIcons';
import GlobalSearchPanel from './GlobalSearchPanel';
import {
  CMD_ICON,
  COMMAND_NAMES,
  COMMAND_TYPES,
  NAV_ITEM_DEFS,
  parseCmd,
  scoreNav,
  type NavItem,
} from './globalSearchConfig';

// ─── Component ───────────────────────────────────────────────
export default function GlobalSearch() {
  const t = useTranslations('components.globalSearch');
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = isAdminRole(user?.roles);

  const navItems = useMemo<NavItem[]>(
    () => NAV_ITEM_DEFS.map((item) => ({
      ...item,
      title: t(`nav.${item.id}.title` as 'nav.dashboard.title'),
      subtitle: t(`nav.${item.id}.subtitle` as 'nav.dashboard.subtitle'),
    })),
    [t],
  );

  const commands = useMemo(
    () => COMMAND_NAMES.map((name) => ({
      name,
      label: t(`commandDefs.${name}.label` as 'commandDefs.inc.label'),
      type: COMMAND_TYPES[name],
      description: t(`commandDefs.${name}.description` as 'commandDefs.inc.description'),
    })),
    [t],
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hasExplicitSelection, setHasExplicitSelection] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);

  // ─── Command mode parsing ────────────────────────────────
  const parsed = parseCmd(query);
  const matchedCmd = parsed ? commands.find(c => c.name === parsed.cmd) ?? null : null;
  const isHelpCmd = parsed?.cmd === 'help';
  const isActiveFilter = Boolean(matchedCmd && parsed?.hasSpace && matchedCmd.type !== null);
  const isPalette = parsed !== null && !isActiveFilter && !isHelpCmd;

  const cmdSuggestions = isPalette
    ? commands.filter(c => c.name.startsWith(parsed!.cmd)).slice(0, 6)
    : [];

  const navResults = !parsed && query.length >= 1
    ? navItems
        .filter((n) => !n.adminOnly || isAdmin)
        .map((n) => ({ ...n, score: scoreNav(n, query) }))
        .filter((n) => n.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
    : !parsed
      ? navItems.filter((n) => !n.adminOnly || isAdmin).slice(0, 6)
      : [];

  const totalItems = isPalette
    ? cmdSuggestions.length
    : navResults.length + results.length;
  const selectedIndex = hasExplicitSelection ? activeIndex : -1;

  // Open on Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditableTarget = Boolean(
        target
        && (
          target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.tagName === 'SELECT'
          || target.isContentEditable
        ),
      );

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        // Avoid hijacking Ctrl/Cmd+K while typing in editable controls.
        if (!open && isEditableTarget) return;
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setActiveIndex(-1);
      setHasExplicitSelection(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced API search
  const doSearch = useCallback(async (q: string, type?: string) => {
    const seq = ++searchSeqRef.current;
    if (q.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { results: r } = await searchApi.query(q, 20, type);
      if (seq !== searchSeqRef.current) return;
      setResults(r);
      setActiveIndex(-1);
      setHasExplicitSelection(false);
    } catch {
      if (seq !== searchSeqRef.current) return;
      setResults([]);
    } finally {
      if (seq === searchSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const handleQueryChange = (q: string) => {
    setQuery(q);
    setHasExplicitSelection(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const p = parseCmd(q);
    if (p !== null) {
      const cmd = commands.find(c => c.name === p.cmd) ?? null;
      if (cmd && p.hasSpace && cmd.type) {
        // Active type-filtered search
        debounceRef.current = setTimeout(() => doSearch(p.term, cmd.type!), 250);
      } else {
        searchSeqRef.current += 1;
        setLoading(false);
        setResults([]);
      }
    } else {
      debounceRef.current = setTimeout(() => doSearch(q), 250);
    }
  };

  // Select a command from the palette
  const selectCommand = (cmd: (typeof commands)[number]) => {
    if (cmd.name === 'help') {
      setQuery('/help');
      setResults([]);
      inputRef.current?.focus();
      return;
    }
    setQuery(`/${cmd.name} `);
    setResults([]);
    setActiveIndex(-1);
    setHasExplicitSelection(false);
    inputRef.current?.focus();
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (totalItems <= 0) return;
      setHasExplicitSelection(true);
      setActiveIndex((i) => Math.min(i + 1, totalItems - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (totalItems <= 0) return;
      setHasExplicitSelection(true);
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex < 0) {
        openGroupedResults();
        return;
      }
      if (isPalette) {
        const cmd = cmdSuggestions[selectedIndex];
        if (cmd) selectCommand(cmd);
        else openGroupedResults();
      } else if (selectedIndex < navResults.length) {
        const item = navResults[selectedIndex];
        if (item) selectNav(item);
        else openGroupedResults();
      } else {
        const r = results[selectedIndex - navResults.length];
        if (r) selectResult(r);
        else openGroupedResults();
      }
    } else if (e.key === 'Backspace' && isActiveFilter && parsed?.term === '') {
      // Clear back to palette when backspacing the term in filter mode
      setQuery(`/${matchedCmd!.name}`);
      setResults([]);
      setHasExplicitSelection(false);
    }
  };

  useEffect(() => {
    setActiveIndex((i) => {
      if (totalItems <= 0) return -1;
      if (i < 0) return -1;
      return Math.min(i, totalItems - 1);
    });
  }, [totalItems]);

  const selectNav = (item: NavItem) => {
    navigate(item.path);
    setOpen(false);
  };

  const selectResult = (r: SearchResult) => {
    navigate(r.path);
    setOpen(false);
  };

  const openGroupedResults = () => {
    const p = parseCmd(query);
    let term = query.trim();
    let type: string | null = null;
    if (p) {
      const cmd = commands.find((c) => c.name === p.cmd) ?? null;
      if (cmd?.type) type = cmd.type;
      term = p.term.trim();
    }
    if (!term) return;
    const qs = new URLSearchParams({ q: term });
    if (type) qs.set('type', type);
    navigate(`/search?${qs.toString()}`);
    setOpen(false);
  };

  // ─── Placeholder text ────────────────────────────────────
  const placeholder = isActiveFilter
    ? t('searchTypePlaceholder', { type: matchedCmd!.label.toLowerCase() })
    : isPalette
      ? t('commandPlaceholder')
      : t('searchIncidentsPlaceholder');

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-400 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors min-w-[200px]"
        title={t('title')}
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="flex-1 text-left">{t('placeholder')}</span>
        <kbd className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded text-slate-500">Ctrl K</kbd>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed inset-x-0 top-[10vh] mx-auto max-w-2xl px-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[70vh]">

          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
            {isActiveFilter ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-xs font-semibold flex-shrink-0">
                <AppIcon name={CMD_ICON[matchedCmd!.name] || 'help'} className="w-3.5 h-3.5" /> {matchedCmd!.label}
              </span>
            ) : (
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
            <input
              ref={inputRef}
              id="global-search"
              name="global-search"
              aria-label={t('placeholder')}
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none"
            />
            {loading && (
              <svg className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            <kbd
              className="hidden sm:inline text-[10px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded cursor-pointer"
              onClick={() => setOpen(false)}
            >
              ESC
            </kbd>
          </div>

          {/* Results */}
          <GlobalSearchPanel
            isHelpCmd={isHelpCmd}
            isPalette={isPalette}
            parsed={parsed}
            commands={commands}
            selectCommand={selectCommand}
            cmdSuggestions={cmdSuggestions}
            selectedIndex={selectedIndex}
            navResults={navResults}
            selectNav={selectNav}
            results={results}
            isActiveFilter={isActiveFilter}
            matchedCmd={matchedCmd}
            selectResult={selectResult}
            query={query}
            loading={loading}
          />

          {/* Footer */}
          <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 text-[10px] text-gray-400">
            <span><kbd className="font-mono bg-gray-100 px-1 py-0.5 rounded">↑↓</kbd> {t('footerNavigate')}</span>
            <span><kbd className="font-mono bg-gray-100 px-1 py-0.5 rounded">↵</kbd> {t('footerSelect')}</span>
            <span><kbd className="font-mono bg-gray-100 px-1 py-0.5 rounded">ESC</kbd> {t('footerClose')}</span>
            <span className="ml-auto">
              {t('footerCommands', { slash: '/' })}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
