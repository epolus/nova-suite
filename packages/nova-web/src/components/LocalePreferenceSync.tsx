/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect } from 'react';
import { auth } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLocaleContext } from '../context/LocaleContext';
import { LOCALE_PREFERENCE_SCOPE, isSupportedLocale } from '../i18n/config';

/**
 * Keeps locale preference synced through `user_preferences` once authenticated.
 */
export default function LocalePreferenceSync() {
  const { user } = useAuth();
  const { applyRemoteLocale, getStoredLocale } = useLocaleContext();

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    auth
      .getPreference(LOCALE_PREFERENCE_SCOPE)
      .then((res) => {
        if (!alive) return;
        const pref = res.preference as Record<string, unknown> | null;
        const remote = pref?.value;
        if (isSupportedLocale(remote)) {
          applyRemoteLocale(remote);
        } else {
          void auth.setPreference(LOCALE_PREFERENCE_SCOPE, { value: getStoredLocale() }).catch(() => {});
        }
      })
      .catch(() => {
        // Keep local fallback
      });
    return () => {
      alive = false;
    };
  }, [user?.id, applyRemoteLocale, getStoredLocale]);

  return null;
}
