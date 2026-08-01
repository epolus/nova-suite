/* SPDX-License-Identifier: AGPL-3.0-only */

type AutoRefreshLabelKey = 'autoRefreshOff' | 'autoRefresh1m' | 'autoRefresh5m' | 'autoRefresh15m';

export function autoRefreshOptionLabel(
  seconds: number,
  t: (key: AutoRefreshLabelKey) => string,
): string {
  if (seconds === 0) return t('autoRefreshOff');
  if (seconds === 60) return t('autoRefresh1m');
  if (seconds === 300) return t('autoRefresh5m');
  if (seconds === 900) return t('autoRefresh15m');
  return `${seconds}s`;
}
