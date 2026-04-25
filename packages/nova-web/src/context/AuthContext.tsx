/* SPDX-License-Identifier: AGPL-3.0-only */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { auth, setToken, clearToken, type User } from '../api/client';

const DATE_TIME_PREF_SCOPE = 'ui:date_time_format';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  setTimeFormat: (timeFormat: '12h' | '24h') => Promise<void>;
  setDateFormat: (dateFormat: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD') => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for SSO token in URL (from OIDC callback redirect)
    const params = new URLSearchParams(window.location.search);
    const ssoToken = params.get('sso_token');
    if (ssoToken) {
      setToken(ssoToken);
      // Clean URL without triggering navigation
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    }

    const token = localStorage.getItem('nova_token');
    if (!token) {
      setLoading(false);
      return;
    }
    auth
      .me()
      .then(async (res) => {
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
      })
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await auth.login(email, password);
    setToken(res.token);
    setUser(res.user);
    cacheDateTimeFormats(res.user.time_format || '24h', res.user.date_format || 'YYYY-MM-DD');
    void auth.setPreference(DATE_TIME_PREF_SCOPE, {
      time_format: res.user.time_format || '24h',
      date_format: res.user.date_format || 'YYYY-MM-DD',
    }).catch(() => {
      // Non-critical; local cache still works.
    });
  }, []);

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
  }, []);

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
  }, []);

  const logout = useCallback(() => {
    clearToken();
    localStorage.removeItem('nova_time_format');
    localStorage.removeItem('nova_date_format');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, setTimeFormat, setDateFormat, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
