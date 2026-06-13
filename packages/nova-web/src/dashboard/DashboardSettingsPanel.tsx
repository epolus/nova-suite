/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { DASHBOARD_AUTO_REFRESH_OPTIONS } from './constants';

export function autoRefreshOptionLabel(
  seconds: number,
  t: ReturnType<typeof useTranslations<'pages.dashboard.customize'>>,
): string {
  if (seconds === 0) return t('autoRefreshOff');
  if (seconds === 60) return t('autoRefresh1m');
  if (seconds === 300) return t('autoRefresh5m');
  if (seconds === 900) return t('autoRefresh15m');
  return `${seconds}s`;
}

interface Props {
  open: boolean;
  autoRefreshSeconds: number;
  onAutoRefreshChange: (seconds: number) => void;
  onCustomizeLayout: () => void;
  onResetLayout: () => void;
  onClose: () => void;
}

export default function DashboardSettingsPanel({
  open,
  autoRefreshSeconds,
  onAutoRefreshChange,
  onCustomizeLayout,
  onResetLayout,
  onClose,
}: Props) {
  const t = useTranslations('pages.dashboard.customize');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label={t('closePanel')}
        onClick={onClose}
      />
      <aside className="relative z-10 w-full max-w-sm h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('settingsTitle')}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t('closePanel')}
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-6">
          <section>
            <label htmlFor="dashboard-auto-refresh" className="block text-sm font-medium text-gray-900 dark:text-gray-100">
              {t('autoRefresh')}
            </label>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('autoRefreshHint')}</p>
            <select
              id="dashboard-auto-refresh"
              value={String(autoRefreshSeconds)}
              onChange={(event) => onAutoRefreshChange(Number.parseInt(event.target.value, 10) || 0)}
              className="mt-3 w-full h-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm text-gray-700 dark:text-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {DASHBOARD_AUTO_REFRESH_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {autoRefreshOptionLabel(seconds, t)}
                </option>
              ))}
            </select>
          </section>

          <section className="pt-2 border-t border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('layoutSection')}</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('layoutSectionHint')}</p>
            <div className="mt-3 flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                className="justify-center"
                onClick={() => {
                  onCustomizeLayout();
                  onClose();
                }}
              >
                {t('editLayout')}
              </Button>
              <Button type="button" variant="outline" className="justify-center" onClick={onResetLayout}>
                {t('resetLayout')}
              </Button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
