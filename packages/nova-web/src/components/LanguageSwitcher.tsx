/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import { useLocaleContext } from '../context/LocaleContext';
import type { AppLocale } from '../i18n/config';

type Variant = 'on-dark-header' | 'on-light-header';

interface Props {
  variant?: Variant;
  showLabel?: boolean;
}

export default function LanguageSwitcher({ variant = 'on-light-header', showLabel = true }: Props) {
  const t = useTranslations('common.language');
  const { locale, setLocale, supportedLocales } = useLocaleContext();

  const base = 'h-7 rounded-md text-xs px-2 border outline-none transition-colors';
  const light = 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-indigo-500';
  const dark = 'bg-white/10 border-white/20 text-white hover:bg-white/15 focus:ring-2 focus:ring-white/50';

  return (
    <label className="inline-flex items-center gap-1.5">
      {showLabel && (
        <span className={variant === 'on-dark-header' ? 'text-xs text-slate-300' : 'text-xs text-gray-500'}>
          {t('label')}
        </span>
      )}
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as AppLocale)}
        className={`${base} ${variant === 'on-dark-header' ? dark : light}`}
        aria-label={t('label')}
      >
        {supportedLocales.map((code) => (
          <option key={code} value={code}>
            {t(code)}
          </option>
        ))}
      </select>
    </label>
  );
}
