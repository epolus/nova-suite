/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { search as searchApi, type SearchResult } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isAdminRole } from '../utils/roles';

// ─── Static navigation items ─────────────────────────────────
interface NavItem {
  title: string;
  subtitle: string;
  path: string;
  icon: IconName;
  adminOnly?: boolean;
}

type IconName =
  | 'home'
  | 'check'
  | 'users'
  | 'incident'
  | 'change'
  | 'problem'
  | 'knowledge'
  | 'ci'
  | 'catalog'
  | 'request'
  | 'user'
  | 'department'
  | 'classes'
  | 'sla'
  | 'workflow'
  | 'settings'
  | 'theme'
  | 'import'
  | 'service_item'
  | 'help'
  | 'record';

const NAV_ITEMS: NavItem[] = [
  { title: 'Dashboard', subtitle: 'Home overview', path: '/', icon: 'home' },
  { title: 'My Todo', subtitle: 'Tasks assigned to me', path: '/my-todo', icon: 'check' },
  { title: 'My Groups', subtitle: 'Incidents from my groups', path: '/my-groups', icon: 'users' },
  { title: 'Incidents', subtitle: 'All incidents', path: '/incidents', icon: 'incident' },
  { title: 'Changes', subtitle: 'Change management', path: '/changes', icon: 'change' },
  { title: 'Problems', subtitle: 'Problem management', path: '/problems', icon: 'problem' },
  { title: 'Knowledge Base', subtitle: 'Browse and author articles', path: '/knowledge', icon: 'knowledge' },
  { title: 'CMDB', subtitle: 'Configuration items', path: '/cmdb', icon: 'ci' },
  { title: 'Service Catalog', subtitle: 'Browse available services', path: '/catalog', icon: 'catalog' },
  { title: 'Requests', subtitle: 'Service requests', path: '/requests', icon: 'request' },
  { title: 'Manage Users', subtitle: 'Admin · Organization', path: '/admin/users', icon: 'user', adminOnly: true },
  { title: 'Manage Departments', subtitle: 'Admin · Organization', path: '/admin/departments', icon: 'department', adminOnly: true },
  { title: 'Manage Companies', subtitle: 'Admin · Organization', path: '/admin/companies', icon: 'department', adminOnly: true },
  { title: 'Manage Locations', subtitle: 'Admin · Organization', path: '/admin/locations', icon: 'department', adminOnly: true },
  { title: 'Manage Assignment Groups', subtitle: 'Admin · Organization', path: '/admin/assignment-groups', icon: 'users', adminOnly: true },
  { title: 'Open CMDB Class Manager', subtitle: 'Admin · CMDB', path: '/admin/ci-classes', icon: 'classes', adminOnly: true },
  { title: 'SLA Configuration', subtitle: 'Admin · Process & Automation', path: '/admin/sla-config', icon: 'sla', adminOnly: true },
  { title: 'Knowledge Workflows', subtitle: 'Admin · Process & Automation', path: '/admin/knowledge-workflows', icon: 'workflow', adminOnly: true },
  { title: 'Change Management Config', subtitle: 'Admin · Process & Automation', path: '/admin/change-management', icon: 'settings', adminOnly: true },
  { title: 'System Status', subtitle: 'Admin · System', path: '/admin/system-status', icon: 'settings', adminOnly: true },
  { title: 'Theming & Branding', subtitle: 'Admin · System', path: '/admin/theming', icon: 'theme', adminOnly: true },
  { title: 'Import Data', subtitle: 'Admin · Data & Integration', path: '/admin/import', icon: 'import', adminOnly: true },
  { title: 'Service Items', subtitle: 'Admin · Service Catalog', path: '/admin/service-items', icon: 'service_item', adminOnly: true },
];

// ─── Commands ────────────────────────────────────────────────
interface Command {
  name: string;
  label: string;
  type: SearchResult['type'] | null;
  description: string;
}

const COMMANDS: Command[] = [
  { name: 'inc', label: 'Incidents',  type: 'incident',  description: 'Search only incidents' },
  { name: 'chg', label: 'Changes',    type: 'change',    description: 'Search only changes' },
  { name: 'prb', label: 'Problems',   type: 'problem',   description: 'Search only problems' },
  { name: 'kb',  label: 'Knowledge',  type: 'knowledge', description: 'Search only knowledge articles' },
  { name: 'ci',  label: 'CMDB',       type: 'ci',        description: 'Search only configuration items' },
  { name: 'help',label: 'Help',       type: null,        description: 'Show all available commands' },
];

function parseCmd(q: string): { cmd: string; term: string; hasSpace: boolean } | null {
  if (!q.startsWith('/')) return null;
  const m = q.match(/^\/(\w*)(\s(.*))?$/);
  if (!m) return null;
  return { cmd: m[1] ?? '', term: m[3] ?? '', hasSpace: Boolean(m[2]) };
}

const TYPE_LABEL: Record<string, string> = {
  incident: 'Incident',
  change: 'Change',
  problem: 'Problem',
  knowledge: 'Knowledge',
  ci: 'CMDB',
};

const TYPE_ICON: Record<string, IconName> = {
  incident: 'incident',
  change: 'change',
  problem: 'problem',
  knowledge: 'knowledge',
  kb: 'knowledge',
  ci: 'ci',
  configuration_item: 'ci',
};

const CMD_ICON: Record<string, IconName> = {
  inc: 'incident',
  chg: 'change',
  prb: 'problem',
  kb: 'knowledge',
  ci: 'ci',
  help: 'help',
};

function scoreNav(item: NavItem, q: string): number {
  const lq = q.toLowerCase();
  const lt = item.title.toLowerCase();
  const ls = item.subtitle.toLowerCase();
  if (lt === lq) return 2;
  if (lt.startsWith(lq)) return 1.5;
  if (lt.includes(lq) || ls.includes(lq)) return 1;
  return 0;
}

function normalizeResultType(type: string): string {
  const value = String(type || '').toLowerCase();
  if (value === 'kb') return 'knowledge';
  if (value === 'configuration_item') return 'ci';
  return value;
}

function AppIcon({ name, className }: { name: IconName; className?: string }) {
  const iconClass = className || 'w-4 h-4';
  switch (name) {
    case 'home': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1v-10.5z" /></svg>;
    case 'check': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>;
    case 'users': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87" /><path strokeLinecap="round" strokeLinejoin="round" d="M16 3.13a4 4 0 010 7.75" /></svg>;
    case 'incident': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" /><path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86l-8.18 14.16A2 2 0 003.83 21h16.34a2 2 0 001.72-2.98L13.71 3.86a2 2 0 00-3.42 0z" /></svg>;
    case 'change': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317a9 9 0 109.358 12.297" /><path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5" /></svg>;
    case 'problem': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M9.09 9a3 3 0 015.82 1c0 2-3 2-3 4" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 17h.01" /></svg>;
    case 'knowledge': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 5a2 2 0 012-2h10a2 2 0 012 2v14a1 1 0 01-1.447.894L12 17.618l-4.553 2.276A1 1 0 016 19V5z" /></svg>;
    case 'ci': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="12" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 20h8m-6-4h4" /></svg>;
    case 'catalog': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="9" cy="20" r="1" /><circle cx="17" cy="20" r="1" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h2l2.4 12.5a1 1 0 001 .8h8.7a1 1 0 001-.76L21 8H7" /></svg>;
    case 'request': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="6" y="3" width="12" height="18" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6M9 11h6M9 15h4" /></svg>;
    case 'user': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="8" r="4" /><path strokeLinecap="round" strokeLinejoin="round" d="M4 21a8 8 0 0116 0" /></svg>;
    case 'department': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M15 9h.01M15 13h.01" /></svg>;
    case 'classes': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="7" height="7" rx="1" /><rect x="14" y="4" width="7" height="7" rx="1" /><rect x="3" y="15" width="7" height="7" rx="1" /><rect x="14" y="15" width="7" height="7" rx="1" /></svg>;
    case 'sla': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" /></svg>;
    case 'workflow': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="5" cy="7" r="2" /><circle cx="19" cy="7" r="2" /><circle cx="12" cy="17" r="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h10M6.7 8.4l4.3 7.2M17.3 8.4L13 15.6" /></svg>;
    case 'settings': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="3" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5h.1a1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9c.2.6.8 1 1.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>;
    case 'theme': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3a9 9 0 100 18 7 7 0 000-14 5 5 0 010-4z" /></svg>;
    case 'import': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" /></svg>;
    case 'service_item': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9-4 9 4-9 4-9-4z" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10l9 4 9-4V7" /></svg>;
    case 'help': return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M9.09 9a3 3 0 015.82 1c0 2-3 2-3 4" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 17h.01" /></svg>;
    default: return <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="5" y="4" width="14" height="16" rx="2" /></svg>;
  }
}

// ─── Component ───────────────────────────────────────────────
export default function GlobalSearch() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = isAdminRole(user?.roles);

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
  const matchedCmd = parsed ? COMMANDS.find(c => c.name === parsed.cmd) ?? null : null;
  const isHelpCmd = parsed?.cmd === 'help';
  const isActiveFilter = Boolean(matchedCmd && parsed?.hasSpace && matchedCmd.type !== null);
  const isPalette = parsed !== null && !isActiveFilter && !isHelpCmd;

  const cmdSuggestions = isPalette
    ? COMMANDS.filter(c => c.name.startsWith(parsed!.cmd)).slice(0, 6)
    : [];

  // ─── Nav items (only in normal mode) ────────────────────
  const navResults = !parsed && query.length >= 1
    ? NAV_ITEMS
        .filter((n) => !n.adminOnly || isAdmin)
        .map((n) => ({ ...n, score: scoreNav(n, query) }))
        .filter((n) => n.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
    : !parsed
      ? NAV_ITEMS.filter((n) => !n.adminOnly || isAdmin).slice(0, 6)
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
      if (seq !== searchSeqRef.current) return;
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (q: string) => {
    setQuery(q);
    setHasExplicitSelection(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const p = parseCmd(q);
    if (p !== null) {
      const cmd = COMMANDS.find(c => c.name === p.cmd) ?? null;
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
  const selectCommand = (cmd: Command) => {
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
      const cmd = COMMANDS.find((c) => c.name === p.cmd) ?? null;
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
    ? `Search ${matchedCmd!.label.toLowerCase()}...`
    : isPalette
      ? 'Type a command or pick one below...'
      : 'Search incidents, changes, knowledge articles, CIs...';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-400 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors min-w-[200px]"
        title="Global search (Ctrl+K)"
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="flex-1 text-left">Search...</span>
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
          <div className="overflow-y-auto flex-1">

            {/* ── Help view ── */}
            {isHelpCmd && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Available commands
                </p>
                {COMMANDS.filter(c => c.name !== 'help').map((cmd) => (
                  <button
                    key={cmd.name}
                    onClick={() => selectCommand(cmd)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">
                      <AppIcon name={CMD_ICON[cmd.name] || 'help'} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <kbd className="text-[10px] font-mono bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                          /{cmd.name}
                        </kbd>
                        <span className="text-sm font-medium text-gray-800">{cmd.label}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{cmd.description}</p>
                    </div>
                  </button>
                ))}
                <div className="px-4 py-3 border-t border-gray-100 mt-1">
                  <p className="text-xs text-gray-400">
                    Type <kbd className="font-mono bg-gray-100 px-1 rounded">/</kbd> to open the command palette, or{' '}
                    <kbd className="font-mono bg-gray-100 px-1 rounded">Ctrl K</kbd> to open search.
                  </p>
                </div>
              </div>
            )}

            {/* ── Command palette ── */}
            {isPalette && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Commands
                </p>
                {cmdSuggestions.length > 0 ? cmdSuggestions.map((cmd, i) => (
                  <button
                    key={cmd.name}
                    onClick={() => selectCommand(cmd)}
                    tabIndex={-1}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      selectedIndex === i ? 'bg-indigo-50' : 'bg-white'
                    }`}
                  >
                    <span className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">
                      <AppIcon name={CMD_ICON[cmd.name] || 'help'} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <kbd className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          selectedIndex === i ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'
                        }`}>
                          /{cmd.name}
                        </kbd>
                        <span className={`text-sm font-medium ${selectedIndex === i ? 'text-indigo-700' : 'text-gray-800'}`}>
                          {cmd.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{cmd.description}</p>
                    </div>
                    {selectedIndex === i && (
                      <span className="ml-auto text-[10px] text-indigo-400 flex-shrink-0">↵ enter</span>
                    )}
                  </button>
                )) : (
                  <p className="px-4 py-6 text-sm text-gray-400 text-center">
                    Unknown command. Try <kbd className="font-mono bg-gray-100 px-1 rounded">/help</kbd> to see all commands.
                  </p>
                )}
              </div>
            )}

            {/* ── Normal mode: Navigation section ── */}
            {!parsed && navResults.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {query ? 'Go to' : 'Quick navigation'}
                </p>
                {navResults.map((item, i) => (
                  <button
                    key={item.path}
                    onClick={() => selectNav(item)}
                    tabIndex={-1}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      selectedIndex === i ? 'bg-indigo-50' : 'bg-white'
                    }`}
                  >
                    <span className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">
                      <AppIcon name={item.icon} />
                    </span>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${selectedIndex === i ? 'text-indigo-700' : 'text-gray-800'}`}>
                        {item.title}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{item.subtitle}</p>
                    </div>
                    {selectedIndex === i && (
                      <span className="ml-auto text-[10px] text-indigo-400 flex-shrink-0">↵ enter</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* ── Records section (normal + filtered) ── */}
            {results.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {isActiveFilter ? matchedCmd!.label : 'Records'}
                </p>
                {results.map((r, i) => {
                  const idx = navResults.length + i;
                  const resultType = normalizeResultType(r.type);
                  return (
                    <button
                      key={`${r.type}-${r.id}`}
                      onClick={() => selectResult(r)}
                      tabIndex={-1}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        selectedIndex === idx ? 'bg-indigo-50' : 'bg-white'
                      }`}
                    >
                      <span className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">
                        <AppIcon name={TYPE_ICON[resultType] ?? 'record'} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                            {TYPE_LABEL[resultType] ?? 'Record'}
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono">{r.identifier}</span>
                        </div>
                        <p className={`text-sm font-medium truncate ${selectedIndex === idx ? 'text-indigo-700' : 'text-gray-800'}`}>
                          {r.title}
                        </p>
                        {r.subtitle && (
                          <p className="text-xs text-gray-400 truncate mt-0.5">{r.subtitle}</p>
                        )}
                      </div>
                      {selectedIndex === idx && (
                        <span className="ml-auto text-[10px] text-indigo-400 flex-shrink-0">↵ enter</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Active filter — no results */}
            {isActiveFilter && !loading && results.length === 0 && parsed!.term.length >= 1 && (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-gray-400">
                  No {matchedCmd!.label.toLowerCase()} found for{' '}
                  <span className="font-medium text-gray-600">"{parsed!.term}"</span>
                </p>
              </div>
            )}

            {/* Active filter — waiting for term */}
            {isActiveFilter && parsed!.term.length === 0 && (
              <p className="px-4 py-10 text-sm text-gray-400 text-center">
                Type to search {matchedCmd!.label.toLowerCase()}...
              </p>
            )}

            {/* Normal empty state */}
            {!parsed && query.length >= 1 && !loading && results.length === 0 && navResults.length === 0 && (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-gray-400">No results for <span className="font-medium text-gray-600">"{query}"</span></p>
                <p className="text-xs text-gray-400 mt-1">Try a different term or use <kbd className="font-mono bg-gray-100 px-1 rounded">/</kbd> for commands.</p>
              </div>
            )}

            {/* Initial hint */}
            {!parsed && query.length === 0 && navResults.length === 0 && (
              <p className="px-4 py-10 text-sm text-gray-400 text-center">Start typing to search...</p>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 text-[10px] text-gray-400">
            <span><kbd className="font-mono bg-gray-100 px-1 py-0.5 rounded">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono bg-gray-100 px-1 py-0.5 rounded">↵</kbd> select</span>
            <span><kbd className="font-mono bg-gray-100 px-1 py-0.5 rounded">ESC</kbd> close</span>
            <span className="ml-auto">
              Type <kbd className="font-mono bg-gray-100 px-1 py-0.5 rounded">/</kbd> for commands
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
