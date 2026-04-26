/* SPDX-License-Identifier: AGPL-3.0-only */

export const DEFAULT_CATALOG_CURRENCY = 'USD';

export function normalizeCurrencyCode(value: string | null | undefined): string {
  const normalized = (value || '').trim().toUpperCase();
  return normalized || DEFAULT_CATALOG_CURRENCY;
}

export function formatCurrency(amount: number, currencyCode: string | null | undefined): string {
  const code = normalizeCurrencyCode(currencyCode);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}
