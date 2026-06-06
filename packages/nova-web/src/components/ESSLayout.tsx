/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';
import { approvals as approvalsApi } from '../api/client';
import { notifications as notificationsApi, type AppNotification } from '../api/client';
import DarkModeToggle from './DarkModeToggle';
import { useTranslations } from 'use-intl';
import { AiAssistantProvider } from './ai/AiAssistantProvider';

const DEFAULT_LOGO_SRC = '/default-logo.svg';

function useFullWidthContent(pathname: string): boolean {
  const fullWidthPaths = new Set([
    '/incidents',
    '/requests',
    '/changes',
    '/problems',
    '/cmdb',
    '/catalog',
    '/knowledge',
  ]);
  return fullWidthPaths.has(pathname);
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
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
      // Avoid spamming the console when API isn't reachable.
      failuresRef.current += 1;
      if (failuresRef.current >= 2) stopPollingRef.current = true;
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 30_000);
    return () => clearInterval(id);
  }, [fetchCount]);

  const handleOpen = async () => {
    setOpen((v) => !v);
    if (!open) {
      setLoading(true);
      setActionError(null);
      try {
        const { notifications } = await notificationsApi.list();
        setItems(notifications);
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    }
  };

  const handleMarkAll = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await notificationsApi.markAllRead();
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
      setUnread(0);
    } catch {
      setActionError('Failed to mark all notifications as read.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    if (actionLoading) return;
    if (items.length === 0) return;
    if (!window.confirm('Delete all notifications?')) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await notificationsApi.deleteAll();
      setItems([]);
      setUnread(0);
    } catch {
      setActionError('Failed to delete notifications.');
    } finally {
      setActionLoading(false);
    }
  };

  const getPath = (n: AppNotification): string | null => {
    if (!n.entity_type || !n.entity_id) return null;
    if (n.entity_type === 'request') return `/requests/${n.entity_id}`;
    if (n.entity_type === 'incident') return `/incidents/${n.entity_id}`;
    if (n.entity_type === 'change') return `/changes/${n.entity_id}`;
    if (n.entity_type === 'problem') return `/problems/${n.entity_id}`;
    if (n.entity_type === 'knowledge') return '/knowledge';
    return null;
  };

  const handleOpenItem = async (n: AppNotification) => {
    if (!n.is_read) {
      try {
        await notificationsApi.markRead(n.id);
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
        setUnread((prev) => Math.max(0, prev - 1));
      } catch {
        // non-critical
      }
    }
    const path = getPath(n);
    if (path) {
      navigate(path);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
        title="Notifications"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 01-6 0" />
        </svg>
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center text-[10px] font-bold text-white rounded-full"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 text-sm font-semibold text-gray-900 flex items-center justify-between gap-3">
            <span>Notifications</span>
            <div className="flex items-center gap-2">
              {items.some((n) => !n.is_read) && (
                <button
                  onClick={handleMarkAll}
                  disabled={actionLoading}
                  className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                >
                  Mark all read
                </button>
              )}
              {items.length > 0 && (
                <button
                  onClick={handleDeleteAll}
                  disabled={actionLoading}
                  className="text-xs text-red-500 hover:text-red-600 disabled:opacity-50"
                >
                  Delete all
                </button>
              )}
            </div>
          </div>
          {actionError && <div className="px-3 py-2 border-b border-gray-100 text-xs text-red-600">{actionError}</div>}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-4 text-xs text-gray-500">Loading...</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-4 text-xs text-gray-500">No notifications</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleOpenItem(n)}
                  className={`w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-gray-50 ${n.is_read ? 'opacity-60' : ''}`}
                >
                  <p className={`text-xs ${n.is_read ? 'text-gray-500' : 'text-gray-900 font-medium'}`}>{n.title}</p>
                  {n.body && <p className="text-xs text-gray-500 truncate mt-0.5">{n.body}</p>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────
export default function ESSLayout() {
  const tNavigation = useTranslations('navigation');
  const tCommon = useTranslations('common');
  const { user, logout } = useAuth();
  const { cartCount } = useCart();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  // ESS-specific pages manage their own layout; reused agent pages need a container
  const needsContainer = !location.pathname.startsWith('/ess');
  const isFullWidthPage = useFullWidthContent(location.pathname);
  const contentContainerClass = isFullWidthPage ? 'w-full max-w-none' : 'max-w-6xl mx-auto';

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

  // Pending approvals count (poll every 60s)
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const fetchApprovalCount = useCallback(async () => {
    try {
      const { count } = await approvalsApi.pendingCount();
      setPendingApprovals(count);
    } catch {
      // non-critical
    }
  }, []);
  useEffect(() => {
    fetchApprovalCount();
    const id = setInterval(fetchApprovalCount, 60_000);
    return () => clearInterval(id);
  }, [fetchApprovalCount]);

  const appNameParts = (theme.app_name || 'Nova Suite').split(' ');
  const firstName = appNameParts[0];
  const restName = appNameParts.slice(1).join(' ');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinks = [
    { to: '/ess', label: tNavigation('ess.home'), end: true },
    { to: '/catalog', label: tNavigation('ess.catalog') },
    { to: '/requests', label: tNavigation('ess.myRequests') },
    { to: '/incidents', label: tNavigation('ess.myIncidents') },
    { to: '/knowledge', label: tNavigation('ess.knowledge') },
    ...(pendingApprovals > 0 ? [{ to: '/ess/approvals', label: tNavigation('ess.approvals'), badge: pendingApprovals }] : []),
  ] as { to: string; label: string; end?: boolean; badge?: number }[];

  return (
    <AiAssistantProvider persona="ess">
    <div className="flex flex-col min-h-screen bg-slate-50 border-x border-gray-200">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 flex-shrink-0 z-20">
        <div className="w-full px-4 sm:px-6 h-16 flex items-center gap-6">

          {/* Logo */}
          <button
            onClick={() => navigate('/ess')}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity flex-shrink-0"
          >
            {logoSrc && <img src={logoSrc} alt="" className="w-7 h-7 object-contain rounded" />}
            <span className="text-lg font-bold tracking-tight text-gray-900">
              <span style={{ color: 'var(--color-primary)' }}>{firstName}</span>
              {restName ? ` ${restName}` : ''}
            </span>
            {theme.app_subtitle && (
              <span className="text-xs text-gray-400 hidden sm:block border-l border-gray-200 pl-2.5">
                {theme.app_subtitle}
              </span>
            )}
          </button>

          {/* Nav */}
          <nav className="flex items-center gap-0.5 flex-1">
            {navLinks.map(({ to, label, end, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }`
                }
                style={({ isActive }) =>
                  isActive ? { color: 'var(--color-primary)', backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)' } : {}
                }
              >
                {label}
                {badge && badge > 0 && (
                  <span
                    className="min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white rounded-full"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <DarkModeToggle variant="on-light-header" />
            <NotificationBell />
            {/* Cart */}
            {cartCount > 0 && (
              <button
                onClick={() => navigate('/cart')}
                className="relative p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                title={tCommon('cart.label')}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center text-[10px] font-bold text-white rounded-full"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  {cartCount}
                </span>
              </button>
            )}

            {/* Avatar + name */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 cursor-pointer"
              style={{ backgroundColor: 'var(--color-primary)' }}
              onClick={() => navigate('/profile/settings')}
              title={tCommon('userMenu.profileSettings')}
            >
              {user?.display_name?.charAt(0) || '?'}
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-gray-900 leading-none">{user?.display_name}</p>
            </div>

            {/* Profile settings */}
            <button
              onClick={() => navigate('/profile/settings')}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              title={tCommon('userMenu.profileSettings')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              title={tCommon('userMenu.logout')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1">
        {needsContainer ? (
          <div className={`${contentContainerClass} px-4 sm:px-6 py-8`}>
            <Outlet />
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
    </AiAssistantProvider>
  );
}
