/* SPDX-License-Identifier: AGPL-3.0-only */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { auth, settings as settingsApi, type ThemeSettings } from '../api/client';

export const UI_DARK_MODE_SCOPE = 'ui:dark_mode';

const DARK_MODE_STORAGE_KEY = 'nova_dark_mode';

export function readStoredDarkMode(): boolean {
  try {
    return localStorage.getItem(DARK_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

const DEFAULT_THEME: ThemeSettings = {
  app_name: 'Nova Suite',
  app_subtitle: 'Service Management',
  primary_color: '#4f46e5',
  sidebar_bg: '#0f172a',
  sidebar_active_bg: '#4f46e5',
  content_bg: '#f1f5f9',
  login_bg_from: '#0f172a',
  login_bg_to: '#1e1b4b',
  dark_content_bg: '#0b1220',
  dark_surface_bg: '#1e293b',
  dark_muted_bg: '#111827',
  dark_border_color: '#475569',
  dark_text_primary: '#f1f5f9',
  dark_text_muted: '#94a3b8',
  logo_url: '',
};

interface ThemeContextValue {
  theme: ThemeSettings;
  loading: boolean;
  reload: () => void;
  isDark: boolean;
  /** User-driven change; persists to `user_preferences` when authenticated. */
  setIsDark: (value: boolean) => void;
  toggleDark: () => void;
  /** Apply preference loaded from the server (no API write). */
  applyRemoteDarkMode: (value: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  loading: true,
  reload: () => {},
  isDark: false,
  setIsDark: () => {},
  toggleDark: () => {},
  applyRemoteDarkMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeSettings>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDarkState] = useState(() => readStoredDarkMode());

  const load = useCallback(() => {
    settingsApi.theme()
      .then((res) => {
        setTheme({ ...DEFAULT_THEME, ...res.settings });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const persistDarkToServer = useCallback((next: boolean) => {
    try {
      if (!localStorage.getItem('nova_token')) return;
      void auth.setPreference(UI_DARK_MODE_SCOPE, { value: next }).catch(() => {
        /* offline / non-critical */
      });
    } catch {
      /* ignore */
    }
  }, []);

  const applyRemoteDarkMode = useCallback((next: boolean) => {
    setIsDarkState(next);
  }, []);

  const setIsDark = useCallback(
    (next: boolean) => {
      setIsDarkState((prev) => {
        if (prev === next) return prev;
        persistDarkToServer(next);
        return next;
      });
    },
    [persistDarkToServer],
  );

  const toggleDark = useCallback(() => {
    setIsDarkState((prev) => {
      const next = !prev;
      persistDarkToServer(next);
      return next;
    });
  }, [persistDarkToServer]);

  useEffect(() => {
    try {
      localStorage.setItem(DARK_MODE_STORAGE_KEY, isDark ? 'true' : 'false');
    } catch {
      /* ignore */
    }
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-primary', theme.primary_color);
    root.style.setProperty('--color-sidebar-bg', theme.sidebar_bg);
    root.style.setProperty('--color-sidebar-active', theme.sidebar_active_bg);
    root.style.setProperty('--color-content-bg', isDark ? (theme.dark_content_bg || DEFAULT_THEME.dark_content_bg!) : theme.content_bg);
    root.style.setProperty('--color-login-from', theme.login_bg_from);
    root.style.setProperty('--color-login-to', theme.login_bg_to);
    root.style.setProperty('--color-dark-content-bg', theme.dark_content_bg || DEFAULT_THEME.dark_content_bg!);
    root.style.setProperty('--color-dark-surface-bg', theme.dark_surface_bg || DEFAULT_THEME.dark_surface_bg!);
    root.style.setProperty('--color-dark-muted-bg', theme.dark_muted_bg || DEFAULT_THEME.dark_muted_bg!);
    root.style.setProperty('--color-dark-border', theme.dark_border_color || DEFAULT_THEME.dark_border_color!);
    root.style.setProperty('--color-dark-text-primary', theme.dark_text_primary || DEFAULT_THEME.dark_text_primary!);
    root.style.setProperty('--color-dark-text-muted', theme.dark_text_muted || DEFAULT_THEME.dark_text_muted!);
  }, [theme, isDark]);

  return (
    <ThemeContext.Provider
      value={{ theme, loading, reload: load, isDark, setIsDark, toggleDark, applyRemoteDarkMode }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
