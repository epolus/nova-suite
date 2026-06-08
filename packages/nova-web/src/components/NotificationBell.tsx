/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { notifications as notificationsApi, type AppNotification } from '@/api/client';
import { formatDateTime } from '@/utils/dateTime';

export default function NotificationBell() {
  const t = useTranslations('common.notifications');
  const tStates = useTranslations('common.states');
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
      failuresRef.current += 1;
      if (failuresRef.current >= 2) stopPollingRef.current = true;
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 30_000);
    return () => clearInterval(id);
  }, [fetchCount]);

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

  const getNotificationPath = (n: AppNotification): string | null => {
    if (!n.entity_type || !n.entity_id) return null;
    if (n.entity_type === 'incident') return `/incidents/${n.entity_id}`;
    if (n.entity_type === 'change') return `/changes/${n.entity_id}`;
    if (n.entity_type === 'problem') return `/problems/${n.entity_id}`;
    if (n.entity_type === 'request') return `/requests/${n.entity_id}`;
    if (n.entity_type === 'knowledge') return '/knowledge';
    return null;
  };

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

  const handleMarkRead = async (n: AppNotification) => {
    if (!n.is_read) {
      try {
        await notificationsApi.markRead(n.id);
        setActionError(null);
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
        setUnread((prev) => Math.max(0, prev - 1));
      } catch {
        setActionError(t('markReadFailed'));
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
      setActionError(t('markAllFailed'));
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
        title={t('title')}
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
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <span className="text-sm font-semibold text-white">{t('title')}</span>
            {items.some((n) => !n.is_read) && (
              <button onClick={handleMarkAll} className="text-xs text-slate-400 hover:text-white transition-colors">
                {t('markAllRead')}
              </button>
            )}
          </div>
          {actionError && (
            <p className="px-3 py-2 text-xs text-red-300 border-b border-white/10">{actionError}</p>
          )}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-slate-400 text-center py-6">{tStates('loading')}</p>
            ) : items.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">{t('empty')}</p>
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
