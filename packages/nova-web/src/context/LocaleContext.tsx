/* SPDX-License-Identifier: AGPL-3.0-only */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { IntlProvider } from 'use-intl';
import { auth } from '../api/client';
import type { AppLocale } from '../i18n/config';
import {
  DEFAULT_LOCALE,
  LOCALE_PREFERENCE_SCOPE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  resolveBrowserLocale,
} from '../i18n/config';
import deMessages from '../i18n/messages/de.json';
import dechMessages from '../i18n/messages/de-ch.json';
import enMessages from '../i18n/messages/en.json';
import frMessages from '../i18n/messages/fr.json';
import itMessages from '../i18n/messages/it.json';

type MessageDict = Record<string, unknown>;

const MESSAGES: Record<AppLocale, MessageDict> = {
  "en": enMessages as MessageDict,
  "de": deMessages as MessageDict,
  "de-ch": dechMessages as MessageDict,
  "fr": frMessages as MessageDict,
  "it": itMessages as MessageDict,
};

function readStoredLocale(): AppLocale {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(raw)) return raw;
  } catch {
    // ignore
  }
  return resolveBrowserLocale(typeof navigator !== 'undefined' ? navigator.language : DEFAULT_LOCALE);
}

interface LocaleContextValue {
  locale: AppLocale;
  supportedLocales: readonly AppLocale[];
  setLocale: (next: AppLocale) => void;
  applyRemoteLocale: (next: AppLocale) => void;
  getStoredLocale: () => AppLocale;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  supportedLocales: SUPPORTED_LOCALES,
  setLocale: () => {},
  applyRemoteLocale: () => {},
  getStoredLocale: () => DEFAULT_LOCALE,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(() => readStoredLocale());

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState((prev) => {
      if (prev === next) return prev;
      try {
        if (localStorage.getItem('nova_token')) {
          void auth.setPreference(LOCALE_PREFERENCE_SCOPE, { value: next }).catch(() => {});
        }
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const applyRemoteLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // ignore
    }
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      supportedLocales: SUPPORTED_LOCALES,
      setLocale,
      applyRemoteLocale,
      getStoredLocale: readStoredLocale,
    }),
    [locale, setLocale, applyRemoteLocale],
  );

  return (
    <LocaleContext.Provider value={value}>
      <IntlProvider locale={locale} messages={MESSAGES[locale]}>
        {children}
      </IntlProvider>
    </LocaleContext.Provider>
  );
}

export function useLocaleContext() {
  return useContext(LocaleContext);
}
