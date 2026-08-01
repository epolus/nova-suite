/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './NotificationBell';
import {
  agentNav,
  catalogDesignerNav,
  adminSections,
  isNavItemActive,
  useFullWidthContent,
  type NavItemDef,
  type AdminSection,
} from './layout/agentNavConfig';
import DarkModeToggle from './DarkModeToggle';
import { hasReportingViewRole, isAdminRole } from '../utils/roles';
import { canAccessAdminRoute } from '../utils/adminRouteAccess';
import { useUserPreferenceState } from '../hooks/useUserPreferenceState';
import { useTranslations } from 'use-intl';
import { AiAssistantProvider } from './ai/AiAssistantProvider';

const DEFAULT_LOGO_SRC = '/default-logo.svg';

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
  const localizedNav: NavItemDef[] = agentNav
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

  const activeSectionKey = activeSection?.key;
  useEffect(() => {
    if (!activeSectionKey) return;
    setExpandedSections((prev) =>
      prev.has(activeSectionKey) ? prev : new Set([...prev, activeSectionKey]),
    );
  }, [activeSectionKey]);

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
    <AiAssistantProvider persona="agent">
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
          <NavLink
            to="/cart"
            title={tCommon('cart.label')}
            className={({ isActive }) =>
              `relative p-1.5 rounded-md transition-colors ${
                isActive
                  ? 'text-white bg-white/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`
            }
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {cartCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center text-[10px] font-bold text-white rounded-full"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </NavLink>
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
    </AiAssistantProvider>
  );
}
