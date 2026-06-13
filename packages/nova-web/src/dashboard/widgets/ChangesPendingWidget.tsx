/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import Badge from '@/components/Badge';
import { usePendingChanges } from '../hooks';
import type { DashboardWidgetProps } from '../types';
import { getListLimit } from './listConfig';

export default function ChangesPendingWidget({ instance }: DashboardWidgetProps) {
  const t = useTranslations('pages.dashboard.changesPending');
  const limit = getListLimit(instance);
  const { data, isLoading, isError, refetch } = usePendingChanges(limit);

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-lg bg-gray-100/80 dark:bg-gray-800/80" />;
  }
  if (isError) {
    return (
      <button type="button" onClick={() => void refetch()} className="text-sm text-red-600 hover:underline">
        Failed to load
      </button>
    );
  }

  const changes = data?.changes ?? [];

  return (
    <div className="h-full flex flex-col px-3 min-w-0">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden divide-y divide-gray-100 dark:divide-gray-800">
        {changes.length === 0 ? (
          <p className="py-8 text-sm text-gray-400 text-center">{t('empty')}</p>
        ) : (
          changes.map((ch) => (
            <Link key={ch.id} to={`/changes/${ch.id}`} className="block py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{ch.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{ch.number} &middot; {t('risk', { level: ch.risk_level })}</p>
                </div>
                <Badge value={ch.status} className="ml-4 flex-shrink-0" />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
