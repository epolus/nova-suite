/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { useStatusLabel } from '@/i18n/hooks';
import { useActiveMajorIncidents } from '../hooks';
import type { DashboardWidgetProps } from '../types';

export default function MajorIncidentsWidget(_props: DashboardWidgetProps) {
  const t = useTranslations('pages.dashboard.customize');
  const statusLabel = useStatusLabel();
  const { data, isLoading, isError, refetch } = useActiveMajorIncidents();

  if (isLoading) {
    return <div className="h-8 animate-pulse rounded-lg bg-gray-100/80 dark:bg-gray-800/80" />;
  }
  if (isError) {
    return (
      <button type="button" onClick={() => void refetch()} className="text-sm text-red-600 hover:underline">
        Failed to load
      </button>
    );
  }

  if (!data || data.length === 0) {
    return <p className="text-sm text-gray-400 py-1">{t('noActiveMajorIncidents')}</p>;
  }

  return (
    <ul className="space-y-2 text-sm max-h-full overflow-y-auto overflow-x-hidden px-1">
      {data.map((m) => (
        <li key={m.id} className="rounded-lg bg-orange-50/80 dark:bg-orange-950/20 px-3 py-2 border border-orange-100 dark:border-orange-900/40">
          <Link to={`/major-incidents/${m.id}`} className="text-indigo-700 dark:text-indigo-400 hover:underline font-medium">
            {m.number} · P{m.priority} · {m.title}
          </Link>
          <span className="text-gray-500 ml-2 capitalize">({statusLabel(m.status)})</span>
        </li>
      ))}
    </ul>
  );
}
