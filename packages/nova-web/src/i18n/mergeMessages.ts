/* SPDX-License-Identifier: AGPL-3.0-only */

export type MessageDict = Record<string, unknown>;

function isMessageDict(value: unknown): value is MessageDict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Locale messages layered on English so new keys fall back until translated. */
export function mergeMessages(base: MessageDict, override: MessageDict): MessageDict {
  const result: MessageDict = { ...base };
  for (const key of Object.keys(override)) {
    const overrideVal = override[key];
    const baseVal = base[key];
    if (isMessageDict(overrideVal) && isMessageDict(baseVal)) {
      result[key] = mergeMessages(baseVal, overrideVal);
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal;
    }
  }
  return result;
}

export function resolveLocaleMessages(locale: string, catalogs: Record<string, MessageDict>): MessageDict {
  const en = catalogs.en ?? {};
  if (locale === 'en') return en;
  const localized = catalogs[locale];
  if (!localized) return en;
  return mergeMessages(en, localized);
}
