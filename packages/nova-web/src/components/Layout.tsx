/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';
import { notifications as notificationsApi, type AppNotification } from '../api/client';
import GlobalSearch from './GlobalSearch';
import DarkModeToggle from './DarkModeToggle';
import { hasReportingViewRole, isAdminRole } from '../utils/roles';
import { canAccessAdminRoute } from '../utils/adminRouteAccess';
import { useUserPreferenceState } from '../hooks/useUserPreferenceState';
import { formatDateTime } from '../utils/dateTime';
import { useTranslations } from 'use-intl';

const DEFAULT_LOGO_SRC = '/default-logo.svg';

// ─── Notification Bell ───────────────────────────────────────
function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const failuresRef = useRef(0);
  const stopPollingRef = useRef(false);
  const navigate = useNavigate();

  const fetchCount = useCallback(async () => {
    if (stopPollingRef.current) return;
    try {
      const { count } = await notificationsApi.unreadCount();
      setUnread(count);
      failuresRef.current = 0;
    } catch {
      // swallow – bell is non-critical
      failuresRef.current += 1;
      if (failuresRef.current >= 2) stopPollingRef.current = true;
    }
  }, []);

  // Poll every 30 seconds
  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 30_000);
    return () => clearInterval(id);
  }, [fetchCount]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = async () => {
    setOpen((v) => !v);
    if (!open) {
      setActionError(null);
      setLoading(true);
      try {
        const { notifications } = await notificationsApi.list();
        setItems(notifications);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
  };

  const getNotificationPath = (n: AppNotification): string | null => {
    if (!n.entity_type || !n.entity_id) return null;
    if (n.entity_type === 'incident') return `/incidents/${n.entity_id}`;
    if (n.entity_type === 'change') return `/changes/${n.entity_id}`;
    if (n.entity_type === 'problem') return `/problems/${n.entity_id}`;
    if (n.entity_type === 'request') return `/requests/${n.entity_id}`;
    if (n.entity_type === 'knowledge') return '/knowledge';
    return null;
  };

  const handleMarkRead = async (n: AppNotification) => {
    if (!n.is_read) {
      try {
        await notificationsApi.markRead(n.id);
        setActionError(null);
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
        setUnread((prev) => Math.max(0, prev - 1));
      } catch {
        setActionError('Failed to mark notification as read.');
        return;
      }
    }
    const path = getNotificationPath(n);
    if (path) {
      navigate(path);
      setOpen(false);
    }
  };

  const handleMarkAll = async () => {
    try {
      await notificationsApi.markAllRead();
      setActionError(null);
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
      setUnread(0);
    } catch {
      setActionError('Failed to mark all notifications as read.');
    }
  };

  const typeIcon: Record<string, string> = {
    assignment: '📋',
    mention: '💬',
    sla_warning: '⚠️',
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="relative p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
        title="Notifications"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 01-6 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center text-[10px] font-bold text-white rounded-full" style={{ backgroundColor: 'var(--color-primary)' }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-80 rounded-lg shadow-xl border border-white/10 z-50 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--color-sidebar-bg)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {items.some((n) => !n.is_read) && (
              <button onClick={handleMarkAll} className="text-xs text-slate-400 hover:text-white transition-colors">
                Mark all read
              </button>
            )}
          </div>
          {actionError && (
            <p className="px-3 py-2 text-xs text-red-300 border-b border-white/10">{actionError}</p>
          )}

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-slate-400 text-center py-6">Loading...</p>
            ) : items.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No notifications</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleMarkRead(n)}
                  className={`w-full text-left px-3 py-2.5 flex gap-2.5 hover:bg-white/10 transition-colors border-b border-white/5 ${n.is_read ? 'opacity-60' : ''}`}
                >
                  <span className="text-base flex-shrink-0 mt-0.5">{typeIcon[n.type] ?? '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-snug truncate ${n.is_read ? 'text-slate-400' : 'text-white font-medium'}`}>{n.title}</p>
                    {n.body && <p className="text-xs text-slate-400 truncate mt-0.5">{n.body}</p>}
                    <p className="text-[10px] text-slate-500 mt-1">{formatDateTime(n.created_at)}</p>
                  </div>
                  {!n.is_read && (
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: 'var(--color-primary)' }} />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const nav = [
  { to: '/', labelKey: 'agent.dashboard', icon: '📊' },
  { to: '/my-todo', labelKey: 'agent.myTodo', icon: '✅' },
  { to: '/my-groups', labelKey: 'agent.myGroups', icon: '👥' },
  { to: '/catalog', labelKey: 'agent.catalog', icon: '📦' },
  { to: '/knowledge', labelKey: 'agent.knowledge', icon: '📚' },
  { to: '/requests', labelKey: 'agent.requests', icon: '📋' },
  { to: '/request-tasks', labelKey: 'agent.requestTasks', icon: '🗂️' },
  { to: '/incidents', labelKey: 'agent.incidents', icon: '🔥' },
  { to: '/major-incidents', labelKey: 'agent.majorIncidents', icon: '🚨' },
  { to: '/problems', labelKey: 'agent.problems', icon: '🧩' },
  { to: '/changes', labelKey: 'agent.changes', icon: '🛠️' },
  { to: '/reports', labelKey: 'agent.reports', icon: '📈' },
  { to: '/cmdb', labelKey: 'agent.cmdb', icon: '🖥️' },
];

const catalogDesignerNav = [
  { to: '/admin/service-items', labelKey: 'admin.serviceItems', icon: '🎨' },
  { to: '/admin/catalog-tasks', labelKey: 'admin.catalogTasks', icon: '📋' },
];

type NavItemDef = { to: string; label: string; icon: string };
type RawNavItemDef = { to: string; labelKey: string; icon: string };
type AdminSection = { key: string; label: string; icon: string; items: NavItemDef[] };
type RawAdminSection = { key: string; labelKey: string; icon: string; items: RawNavItemDef[] };

function isWorkflowEditorPath(pathname: string): boolean {
  return pathname === '/admin/workflows/editor' || pathname.startsWith('/admin/workflows/editor/')
    || pathname === '/admin/workflows/designer' || pathname.startsWith('/admin/workflows/designer/');
}

function isWorkflowExecutionDetailPath(pathname: string): boolean {
  return /^\/admin\/workflows\/[^/]+\/[^/]+$/.test(pathname);
}

function isNavItemActive(itemTo: string, pathname: string | undefined, fallbackIsActive: boolean): boolean {
  if (!pathname) return fallbackIsActive;

  if (itemTo === '/admin/workflows') {
    return pathname === '/admin/workflows' || isWorkflowExecutionDetailPath(pathname);
  }

  if (itemTo === '/admin/workflows/editor') {
    return isWorkflowEditorPath(pathname);
  }

  return fallbackIsActive;
}

function useFullWidthContent(pathname: string): boolean {
  const fullWidthPaths = new Set([
    '/incidents',
    '/requests',
    '/changes',
    '/problems',
    '/cmdb',
    '/admin/workflows',
    '/admin/catalog-tasks',
    '/admin/service-items',
    '/admin/data-sources',
  ]);
  return fullWidthPaths.has(pathname);
}

const adminSections: RawAdminSection[] = [
  {
    key: 'org',
    labelKey: 'adminSections.organization',
    icon: '🏢',
    items: [
      { to: '/admin/users', labelKey: 'admin.users', icon: '👤' },
      { to: '/admin/departments', labelKey: 'admin.departments', icon: '🏢' },
      { to: '/admin/cost-centers', labelKey: 'admin.costCenters', icon: '💰' },
      { to: '/admin/companies', labelKey: 'admin.companies', icon: '🏛️' },
      { to: '/admin/locations', labelKey: 'admin.locations', icon: '📍' },
      { to: '/admin/roles', labelKey: 'admin.roles', icon: '🔑' },
      { to: '/admin/assignment-groups', labelKey: 'admin.assignmentGroups', icon: '👥' },
    ],
  },
  {
    key: 'catalog',
    labelKey: 'adminSections.serviceCatalog',
    icon: '📦',
    items: [
      { to: '/admin/services', labelKey: 'admin.services', icon: '🔧' },
      { to: '/admin/service-items', labelKey: 'admin.serviceItems', icon: '🎨' },
      { to: '/admin/catalog-tasks', labelKey: 'admin.catalogTasks', icon: '📋' },
    ],
  },
  {
    key: 'process',
    labelKey: 'adminSections.processAutomation',
    icon: '⚙️',
    items: [
      { to: '/admin/processes', labelKey: 'admin.processes', icon: '⚙️' },
      { to: '/admin/sla-config', labelKey: 'admin.slaConfiguration', icon: '⏱️' },
      { to: '/admin/notification-config', labelKey: 'admin.notificationWorkflows', icon: '🔔' },
      { to: '/admin/notification-deliveries', labelKey: 'admin.notificationDeliveries', icon: '📨' },
      { to: '/admin/change-management', labelKey: 'admin.changeManagement', icon: '🛠️' },
      { to: '/admin/knowledge-workflows', labelKey: 'admin.knowledgeWorkflows', icon: '📚' },
      { to: '/admin/workflows', labelKey: 'admin.workflows', icon: '🔄' },
      { to: '/admin/workflows/editor', labelKey: 'admin.workflowEditor', icon: '🧩' },
    ],
  },
  {
    key: 'cmdb',
    labelKey: 'adminSections.cmdb',
    icon: '🖥️',
    items: [
      { to: '/admin/ci-classes', labelKey: 'admin.ciClasses', icon: '🏗️' },
    ],
  },
  {
    key: 'data',
    labelKey: 'adminSections.dataIntegration',
    icon: '🔗',
    items: [
      { to: '/admin/data-sources', labelKey: 'admin.dataSources', icon: '🔗' },
      { to: '/admin/credentials', labelKey: 'admin.credentials', icon: '🔐' },
      { to: '/admin/config-packages', labelKey: 'admin.configPackages', icon: '📦' },
      { to: '/admin/import', labelKey: 'admin.importData', icon: '📥' },
    ],
  },
  {
    key: 'system',
    labelKey: 'adminSections.system',
    icon: '🛠️',
    items: [
      { to: '/admin/system-status', labelKey: 'admin.status', icon: '🟢' },
      { to: '/admin/theming', labelKey: 'admin.theming', icon: '🎨' },
    ],
  },
];

function NavItem({ item }: { item: NavItemDef }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'nav-active text-white'
            : 'text-slate-300 hover:bg-white/10 hover:text-white'
        }`
      }
      style={({ isActive }) => isActive ? { backgroundColor: 'var(--color-sidebar-active)' } : {}}
    >
      <span className="text-lg">{item.icon}</span>
      {item.label}
    </NavLink>
  );
}

function CollapsibleNavItem({ item, collapsed, currentPath }: { item: NavItemDef; collapsed: boolean; currentPath?: string }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={item.label}
      className={({ isActive }) =>
        {
          const active = isNavItemActive(item.to, currentPath, isActive);
          return (
        `flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          collapsed ? 'justify-center' : 'gap-3'
        } ${
          active
            ? 'nav-active text-white'
            : 'text-slate-300 hover:bg-white/10 hover:text-white'
        }`
          );
        }
      }
      style={({ isActive }) => {
        const active = isNavItemActive(item.to, currentPath, isActive);
        return active ? { backgroundColor: 'var(--color-sidebar-active)' } : {};
      }}
    >
      <span className="text-lg">{item.icon}</span>
      {!collapsed && item.label}
    </NavLink>
  );
}

function AdminSubMenu({ section, expanded, onToggle, collapsed = false, currentPath }: {
  section: AdminSection;
  expanded: boolean;
  onToggle: () => void;
  collapsed?: boolean;
  currentPath?: string;
}) {
  if (collapsed) {
    return (
      <div className="space-y-0.5">
        {section.items.map((item) => (
          <CollapsibleNavItem key={item.to} item={item} collapsed currentPath={currentPath} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
      >
        <span className="text-base">{section.icon}</span>
        <span className="flex-1 text-left">{section.label}</span>
        <svg
          className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="pl-3 pt-0.5 space-y-0.5">
          {section.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                {
                  const active = isNavItemActive(item.to, currentPath, isActive);
                  return (
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                  active
                    ? 'text-white'
                    : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
                }`
                  );
                }
              }
              style={({ isActive }) => {
                const active = isNavItemActive(item.to, currentPath, isActive);
                return active ? { backgroundColor: 'var(--color-sidebar-active)' } : {};
              }}
            >
              <span className="text-sm">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const tNavigation = useTranslations('navigation');
  const tCommon = useTranslations('common');
  const { user, logout } = useAuth();
  const { cartCount } = useCart();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [logoSrc, setLogoSrc] = useState(DEFAULT_LOGO_SRC);
  useEffect(() => {
    if (!theme.logo_url) { setLogoSrc(DEFAULT_LOGO_SRC); return; }
    const token = localStorage.getItem('nova_token');
    fetch('/api/settings/logo', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => { if (r.ok) return r.blob(); throw new Error(); })
      .then((blob) => setLogoSrc(URL.createObjectURL(blob)))
      .catch(() => setLogoSrc(DEFAULT_LOGO_SRC));
  }, [theme.logo_url]);

  const appNameParts = (theme.app_name || 'Nova Suite').split(' ');
  const firstName = appNameParts[0];
  const restName = appNameParts.slice(1).join(' ');

  const isAdmin = isAdminRole(user?.roles);
  const localizedNav: NavItemDef[] = nav
    .filter((item) => {
      if (item.to === '/reports') return hasReportingViewRole(user?.roles);
      return true;
    })
    .map((item) => ({
      to: item.to,
      icon: item.icon,
      label: tNavigation(item.labelKey),
    }));
  const localizedCatalogDesignerNav: NavItemDef[] = catalogDesignerNav.map((item) => ({
    to: item.to,
    icon: item.icon,
    label: tNavigation(item.labelKey),
  }));
  const localizedAdminSections: AdminSection[] = adminSections.map((section) => ({
    key: section.key,
    icon: section.icon,
    label: tNavigation(section.labelKey),
    items: section.items.map((item) => ({
      to: item.to,
      icon: item.icon,
      label: tNavigation(item.labelKey),
    })),
  }));

  const filteredAdminSections = localizedAdminSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccessAdminRoute(item.to, user?.roles)),
    }))
    .filter((section) => section.items.length > 0);

  const filteredCatalogDesignerNav = localizedCatalogDesignerNav.filter((item) =>
    canAccessAdminRoute(item.to, user?.roles),
  );

  const hasAdministrationNav = filteredAdminSections.length > 0;
  const isFullWidthPage = useFullWidthContent(location.pathname);
  const contentContainerClass = isFullWidthPage ? 'w-full max-w-none' : 'max-w-7xl mx-auto';

  // Auto-expand the section that contains the current route
  const activeSection = filteredAdminSections.find((s) =>
    s.items.some((item) => location.pathname === item.to || location.pathname.startsWith(item.to + '/')),
  );
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(activeSection ? [activeSection.key] : []),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useUserPreferenceState<boolean>(
    'ui:sidebar_collapsed',
    false,
    'nova_sidebar_collapsed',
  );

  useEffect(() => {
    if (activeSection && !expandedSections.has(activeSection.key)) {
      setExpandedSections((prev) => new Set([...prev, activeSection.key]));
    }
  }, [location.pathname]);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Top header ── */}
      <header className="flex-shrink-0 h-14 flex items-center justify-between px-4 border-b border-white/10 z-10" style={{ backgroundColor: 'var(--color-sidebar-bg)' }}>
        {/* Logo + name */}
        <button onClick={() => navigate('/')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          {logoSrc && <img src={logoSrc} alt="" className="w-7 h-7 object-contain rounded" />}
          <span className="text-lg font-bold tracking-tight text-white">
            <span style={{ color: 'var(--color-primary)' }}>{firstName}</span>
            {restName ? ` ${restName}` : ''}
          </span>
          {theme.app_subtitle && (
            <span className="text-xs text-slate-400 hidden sm:block">{theme.app_subtitle}</span>
          )}
        </button>

        {/* Global search */}
        <GlobalSearch />

        {/* User profile */}
        <div className="flex items-center gap-2">
          <DarkModeToggle variant="on-dark-header" />
          <NotificationBell />
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ backgroundColor: 'var(--color-primary)' }}>
            {user?.display_name?.charAt(0) || '?'}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-white leading-none">{user?.display_name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{user?.roles?.join(', ')}</p>
          </div>
          <button onClick={() => navigate('/profile/settings')} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors" title={tCommon('userMenu.profileSettings')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button onClick={handleLogout} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors" title={tCommon('userMenu.logout')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`text-white flex flex-col flex-shrink-0 transition-all duration-200 ${
          sidebarCollapsed ? 'w-14' : 'w-64'
        }`}
        style={{ backgroundColor: 'var(--color-sidebar-bg)' }}
      >
        {/* Collapse toggle */}
        <div className={`flex ${sidebarCollapsed ? 'justify-center' : 'justify-end'} px-2 pt-3 pb-1`}>
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors"
            title={sidebarCollapsed ? tCommon('sidebar.expandNavigation') : tCommon('sidebar.collapseNavigation')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={sidebarCollapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'} />
            </svg>
          </button>
        </div>

        <nav className={`flex-1 py-2 space-y-1 overflow-y-auto ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
          {localizedNav.map((item) => <CollapsibleNavItem key={item.to} item={item} collapsed={sidebarCollapsed} currentPath={location.pathname} />)}

          <NavLink
            to="/cart"
            title={tCommon('cart.label')}
            className={({ isActive }) =>
              `flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                sidebarCollapsed ? 'justify-center' : 'gap-3'
              } ${
                isActive
                  ? 'text-white'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`
            }
            style={({ isActive }) => isActive ? { backgroundColor: 'var(--color-sidebar-active)' } : {}}
          >
            <span className="text-lg">🛒</span>
            {!sidebarCollapsed && tCommon('cart.label')}
            {cartCount > 0 && (
              <span className={`${sidebarCollapsed ? 'ml-0' : 'ml-auto'} text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center`} style={{ backgroundColor: 'var(--color-primary)' }}>
                {cartCount}
              </span>
            )}
          </NavLink>

          {/* Catalog Designer section (only when NOT admin, since admin already shows these) */}
          {filteredCatalogDesignerNav.length > 0 && !isAdmin && (
            <>
              {!sidebarCollapsed && (
                <div className="pt-4 pb-1 px-3">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{tNavigation('agent.catalogDesigner')}</p>
                </div>
              )}
              {filteredCatalogDesignerNav.map((item) => <CollapsibleNavItem key={item.to} item={item} collapsed={sidebarCollapsed} />)}
            </>
          )}

          {hasAdministrationNav && (
            <>
              {!sidebarCollapsed && (
                <div className="pt-5 pb-1 px-3">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{tNavigation('adminSections.administration')}</p>
                </div>
              )}
              <div className="space-y-0.5">
                {filteredAdminSections.map((section) => (
                  <AdminSubMenu
                    key={section.key}
                    section={section}
                    expanded={expandedSections.has(section.key)}
                    collapsed={sidebarCollapsed}
                    currentPath={location.pathname}
                    onToggle={() => toggleSection(section.key)}
                  />
                ))}
              </div>
            </>
          )}
        </nav>

      </aside>

      {/* Main content */}
      <main
        className={`flex-1 overflow-auto ${isFullWidthPage ? 'border-x border-gray-200' : ''}`}
        style={{ backgroundColor: 'var(--color-content-bg)' }}
      >
        <div className={`p-6 lg:p-8 ${contentContainerClass}`}>
          <Outlet />
        </div>
      </main>
      </div>
    </div>
  );
}
