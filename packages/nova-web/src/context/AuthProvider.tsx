/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { auth, type User } from '../api/client';
import { dropLegacyToken, setSessionUser, setUnauthorizedHandler } from '../api/http';
import { AuthContext } from './AuthContext';

const DATE_TIME_PREF_SCOPE = 'ui:date_time_format';

function cacheDateTimeFormats(
  timeFormat: '12h' | '24h',
  dateFormat: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD',
) {
  localStorage.setItem('nova_time_format', timeFormat || '24h');
  localStorage.setItem('nova_date_format', dateFormat || 'YYYY-MM-DD');
}

function isValidTimeFormat(v: unknown): v is '12h' | '24h' {
  return v === '12h' || v === '24h';
}

function isValidDateFormat(v: unknown): v is 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' {
  return v === 'DD.MM.YYYY' || v === 'MM/DD/YYYY' || v === 'YYYY-MM-DD';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((next: User | null | ((prev: User | null) => User | null)) => {
    setUserState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      setSessionUser(value?.id ?? null);
      return value;
    });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.clear();
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient, setUser]);

  useEffect(() => {
    const bootstrapAuth = async () => {
      dropLegacyToken();
      const params = new URLSearchParams(window.location.search);
      const ssoCode = params.get('sso_code');
      if (ssoCode) {
        try {
          await auth.exchangeSsoCode(ssoCode);
        } catch {
          // Invalid or expired code: fall through to the login page.
        } finally {
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, '', cleanUrl);
        }
      }

      try {
        const res = await auth.me();
        if (!res.user) {
          setUser(null);
          return;
        }
        setUser(res.user);
        cacheDateTimeFormats(res.user.time_format || '24h', res.user.date_format || 'YYYY-MM-DD');

        // Keep date/time format preference aligned across browsers/devices.
        try {
          const prefRes = await auth.getPreference(DATE_TIME_PREF_SCOPE);
          const pref = prefRes.preference as Record<string, unknown> | null;
          const prefTime = pref?.time_format;
          const prefDate = pref?.date_format;
          if (isValidTimeFormat(prefTime) && isValidDateFormat(prefDate)) {
            cacheDateTimeFormats(prefTime, prefDate);
            setUser((prev) => (prev ? { ...prev, time_format: prefTime, date_format: prefDate } : prev));
          } else {
            await auth.setPreference(DATE_TIME_PREF_SCOPE, {
              time_format: res.user.time_format || '24h',
              date_format: res.user.date_format || 'YYYY-MM-DD',
            });
          }
        } catch {
          // Non-critical: keep server user profile values.
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    void bootstrapAuth();
  }, [setUser]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await auth.login(email, password);
    queryClient.clear();
    setUser(res.user);
    cacheDateTimeFormats(res.user.time_format || '24h', res.user.date_format || 'YYYY-MM-DD');
    void auth.setPreference(DATE_TIME_PREF_SCOPE, {
      time_format: res.user.time_format || '24h',
      date_format: res.user.date_format || 'YYYY-MM-DD',
    }).catch(() => {
      // Non-critical; local cache still works.
    });
  }, [queryClient, setUser]);

  const setTimeFormat = useCallback(async (timeFormat: '12h' | '24h') => {
    const res = await auth.updateTimeFormat(timeFormat);
    setUser(res.user);
    cacheDateTimeFormats(res.user.time_format || '24h', res.user.date_format || 'YYYY-MM-DD');
    void auth.setPreference(DATE_TIME_PREF_SCOPE, {
      time_format: res.user.time_format || '24h',
      date_format: res.user.date_format || 'YYYY-MM-DD',
    }).catch(() => {
      // Non-critical; local cache still works.
    });
  }, [setUser]);

  const setDateFormat = useCallback(async (dateFormat: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD') => {
    const res = await auth.updateDateFormat(dateFormat);
    setUser(res.user);
    cacheDateTimeFormats(res.user.time_format || '24h', res.user.date_format || 'YYYY-MM-DD');
    void auth.setPreference(DATE_TIME_PREF_SCOPE, {
      time_format: res.user.time_format || '24h',
      date_format: res.user.date_format || 'YYYY-MM-DD',
    }).catch(() => {
      // Non-critical; local cache still works.
    });
  }, [setUser]);

  const logout = useCallback(async () => {
    try {
      await auth.logout();
    } catch {
      // The session cookie is httpOnly; if the server is unreachable it expires on its own.
    }
    localStorage.removeItem('nova_time_format');
    localStorage.removeItem('nova_date_format');
    queryClient.clear();
    setUser(null);
  }, [queryClient, setUser]);

  return (
    <AuthContext.Provider value={{ user, loading, login, setTimeFormat, setDateFormat, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
