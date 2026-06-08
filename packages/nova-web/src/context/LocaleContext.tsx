/* SPDX-License-Identifier: AGPL-3.0-only */
import { createContext, useContext } from 'react';
import type { AppLocale } from '../i18n/config';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../i18n/config';

export interface LocaleContextValue {
  locale: AppLocale;
  supportedLocales: readonly AppLocale[];
  setLocale: (next: AppLocale) => void;
  applyRemoteLocale: (next: AppLocale) => void;
  getStoredLocale: () => AppLocale;
}

export const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  supportedLocales: SUPPORTED_LOCALES,
  setLocale: () => {},
  applyRemoteLocale: () => {},
  getStoredLocale: () => DEFAULT_LOCALE,
});

export function useLocaleContext() {
  return useContext(LocaleContext);
}
