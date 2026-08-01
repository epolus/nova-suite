/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect } from 'react';
import { auth } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { readStoredDarkMode, UI_DARK_MODE_SCOPE, useTheme } from '../context/ThemeContext';

function isBool(v: unknown): v is boolean {
  return v === true || v === false;
}

/**
 * Loads `ui:dark_mode` from `user_preferences` after auth; seeds the server from local storage when missing.
 * Must render under both ThemeProvider and AuthProvider.
 */
export default function DarkModePreferenceSync() {
  const { user } = useAuth();
  const { applyRemoteDarkMode } = useTheme();

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    auth
      .getPreference(UI_DARK_MODE_SCOPE)
      .then((res) => {
        if (!alive) return;
        const p = res.preference as Record<string, unknown> | null;
        if (p && isBool(p.value)) {
          applyRemoteDarkMode(p.value);
        } else {
          const local = readStoredDarkMode();
          void auth.setPreference(UI_DARK_MODE_SCOPE, { value: local }).catch(() => {});
        }
      })
      .catch(() => {
        /* keep current local theme */
      });
    return () => {
      alive = false;
    };
  }, [user?.id, applyRemoteDarkMode]);

  return null;
}
