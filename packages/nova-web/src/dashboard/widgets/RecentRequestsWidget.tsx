/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import Badge from '@/components/Badge';
import { useRecentRequests } from '../hooks';
import type { DashboardWidgetProps } from '../types';
import { getListLimit } from './listConfig';

export default function RecentRequestsWidget({ instance }: DashboardWidgetProps) {
  const t = useTranslations('pages.dashboard.recentRequests');
  const limit = getListLimit(instance);
  const { data, isLoading, isError, refetch } = useRecentRequests(limit);

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

  const requests = data?.requests ?? [];

  return (
    <div className="h-full flex flex-col px-3 min-w-0">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden divide-y divide-gray-100 dark:divide-gray-800">
        {requests.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-400 mb-3">{t('empty')}</p>
            <Link to="/catalog" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
              {t('browseCatalog')}
            </Link>
          </div>
        ) : (
          requests.map((req) => (
            <Link key={req.id} to={`/requests/${req.id}`} className="block py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{req.service_item_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{req.number} &middot; {req.requester_name}</p>
                </div>
                <Badge value={req.status} className="ml-4 flex-shrink-0" />
              </div>
            </Link>
          ))
        )}
      </div>
      {requests.length > 0 && (
        <div className="pt-2 pb-1 border-t border-gray-100 dark:border-gray-800">
          <Link to="/catalog" className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
            {t('newFromCatalog')}
          </Link>
        </div>
      )}
    </div>
  );
}
