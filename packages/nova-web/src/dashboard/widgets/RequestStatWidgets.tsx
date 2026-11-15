/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import { DashboardIcons } from '../icons';
import { useOpenRequestsCount } from '../hooks';
import type { DashboardWidgetProps } from '../types';
import { StatContent, WidgetLoadError } from './shared';

export default function OpenRequestsStatWidget(_props: DashboardWidgetProps) {
  const t = useTranslations('pages.dashboard.stats');
  const { data, isLoading, isError, refetch } = useOpenRequestsCount();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-lg bg-gray-100/80 dark:bg-gray-800/80" />;
  }
  if (isError || data === undefined) {
    return (
      <WidgetLoadError onRetry={() => void refetch()} />
    );
  }

  return (
    <StatContent
      label={t('openRequests')}
      value={data}
      accent="blue"
      icon={<DashboardIcons.request className="size-5" />}
      link="/requests?active=true"
    />
  );
}
