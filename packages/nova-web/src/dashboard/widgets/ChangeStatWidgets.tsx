/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import { DashboardIcons } from '../icons';
import { useChangeStats } from '../hooks';
import type { DashboardWidgetProps } from '../types';
import { StatContent, WidgetLoadError } from './shared';

export default function OpenChangesStatWidget(_props: DashboardWidgetProps) {
  const t = useTranslations('pages.dashboard.stats');
  const { data, isLoading, isError, refetch } = useChangeStats();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-lg bg-gray-100/80 dark:bg-gray-800/80" />;
  }
  if (isError || !data) {
    return (
      <WidgetLoadError onRetry={() => void refetch()} />
    );
  }

  return (
    <StatContent
      label={t('openChanges')}
      value={data.open_total}
      accent="violet"
      icon={<DashboardIcons.change className="size-5" />}
      link="/changes"
    />
  );
}
