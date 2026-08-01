/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { auth, settings as settingsApi, type ThemeSettings } from '../api/client';
import {
  DARK_MODE_STORAGE_KEY,
  DEFAULT_THEME,
  ThemeContext,
  UI_DARK_MODE_SCOPE,
  readStoredDarkMode,
} from './ThemeContext';

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
