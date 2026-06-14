/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { UserDashboard } from '@/api/domains/dashboards';

interface Props {
  dashboards: UserDashboard[];
  activeId: string | null;
  disabled?: boolean;
  onSelect: (id: string) => void;
}

export default function DashboardSwitcher({
  dashboards,
  activeId,
  disabled = false,
  onSelect,
}: Props) {
  const t = useTranslations('pages.dashboard.customize');

  if (dashboards.length <= 1) return null;

  return (
    <select
      id="dashboard-switcher"
      aria-label={t('switchDashboard')}
      value={activeId ?? ''}
      disabled={disabled || !activeId}
      onChange={(event) => onSelect(event.target.value)}
      className="h-9 min-w-[10rem] max-w-[14rem] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm text-gray-700 dark:text-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
    >
        {dashboards.map((dashboard) => (
          <option key={dashboard.id} value={dashboard.id}>
            {dashboard.name}
            {dashboard.is_default ? ` (${t('defaultBadge')})` : ''}
          </option>
        ))}
      </select>
  );
}
