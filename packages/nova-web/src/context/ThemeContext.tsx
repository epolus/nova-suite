/* SPDX-License-Identifier: AGPL-3.0-only */
import { createContext, useContext } from 'react';
import { type ThemeSettings } from '../api/client';

export const UI_DARK_MODE_SCOPE = 'ui:dark_mode';

export const DARK_MODE_STORAGE_KEY = 'nova_dark_mode';

export function readStoredDarkMode(): boolean {
  try {
    return localStorage.getItem(DARK_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export const DEFAULT_THEME: ThemeSettings = {
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
  catalog_currency: 'USD',
  logo_url: '',
};

export interface ThemeContextValue {
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

export const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  loading: true,
  reload: () => {},
  isDark: false,
  setIsDark: () => {},
  toggleDark: () => {},
  applyRemoteDarkMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}
