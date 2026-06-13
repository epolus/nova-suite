/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import Badge from '@/components/Badge';
import { formatDate } from '@/utils/dateTime';
import { useMyQueue } from '../hooks';
import type { DashboardWidgetProps } from '../types';
import { PRIORITY_CONFIG } from './priorityConfig';
import { getListLimit } from './listConfig';

export default function MyQueueWidget({ instance }: DashboardWidgetProps) {
  const t = useTranslations('pages.dashboard');
  const tList = useTranslations('common.list');
  const limit = getListLimit(instance);
  const { data, isLoading, isError, refetch } = useMyQueue(limit);

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

  const incidents = data?.incidents ?? [];

  return (
    <div className="h-full flex flex-col px-3 min-w-0">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden divide-y divide-gray-100 dark:divide-gray-800">
        {incidents.length === 0 ? (
          <p className="py-8 text-sm text-gray-400 text-center">{t('queue.empty')}</p>
        ) : (
          incidents.map((inc) => {
            const cfg = PRIORITY_CONFIG[inc.priority];
            return (
              <Link key={inc.id} to={`/incidents/${inc.id}`} className="block py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-2.5">
                    <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${cfg?.dot ?? 'bg-gray-300'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{inc.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {inc.number}
                        {inc.sla_due_at && (
                          <span className={`ml-2 ${inc.sla_breached ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                            {inc.sla_breached ? tList('breached') : t('queue.due', { date: formatDate(inc.sla_due_at) })}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <Badge value={inc.status} />
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
