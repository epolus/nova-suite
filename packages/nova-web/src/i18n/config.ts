/* SPDX-License-Identifier: AGPL-3.0-only */
const BASE_SUPPORTED_LOCALES = ['en', 'de', 'de-ch', 'fr', 'it'] as const;

export type AppLocale = (typeof BASE_SUPPORTED_LOCALES)[number];

type EnvMap = Record<string, string | undefined>;
const viteEnv: EnvMap = ((import.meta as unknown as { env?: EnvMap }).env) ?? {};
const env = (key: string): string | undefined => viteEnv[key];

const supportedFromEnv = env('VITE_SUPPORTED_LOCALES')
  ?.split(',')
  .map((v) => v.trim().toLowerCase())
  .filter((v): v is AppLocale => (BASE_SUPPORTED_LOCALES as readonly string[]).includes(v));

export const SUPPORTED_LOCALES: readonly AppLocale[] =
  supportedFromEnv && supportedFromEnv.length > 0 ? supportedFromEnv : BASE_SUPPORTED_LOCALES;

const defaultLocaleFromEnv = env('VITE_DEFAULT_LOCALE')?.toLowerCase();
export const DEFAULT_LOCALE: AppLocale = isSupportedLocale(defaultLocaleFromEnv) ? defaultLocaleFromEnv : 'en';

export const LOCALE_STORAGE_KEY = env('VITE_LOCALE_STORAGE_KEY') || 'nova_locale';
export const LOCALE_PREFERENCE_SCOPE = env('VITE_LOCALE_PREFERENCE_SCOPE') || 'ui:locale';

export function isSupportedLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value.toLowerCase());
}

export function resolveBrowserLocale(input: string | undefined | null): AppLocale {
  if (!input) return DEFAULT_LOCALE;
  const normalized = input.toLowerCase().replace('_', '-');
  if (isSupportedLocale(normalized)) return normalized;
  const languageOnly = normalized.split('-')[0];
  return isSupportedLocale(languageOnly) ? languageOnly : DEFAULT_LOCALE;
}
