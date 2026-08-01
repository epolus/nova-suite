/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import { DashboardIcons } from '../icons';
import { useIncidentStats, useMyQueue } from '../hooks';
import type { DashboardWidgetProps } from '../types';
import { StatContent } from './shared';

export default function OpenIncidentsStatWidget(_props: DashboardWidgetProps) {
  const t = useTranslations('pages.dashboard.stats');
  const { data, isLoading, isError, refetch } = useIncidentStats();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-lg bg-gray-100/80 dark:bg-gray-800/80" />;
  }
  if (isError || !data) {
    return (
      <button type="button" onClick={() => void refetch()} className="text-sm text-red-600 hover:underline">
        Failed to load
      </button>
    );
  }

  return (
    <StatContent
      label={t('openIncidents')}
      value={data.open_total}
      accent="indigo"
      icon={DashboardIcons.incident('w-5 h-5')}
      link="/incidents"
    />
  );
}

export function SlaBreachedStatWidget(_props: DashboardWidgetProps) {
  const t = useTranslations('pages.dashboard.stats');
  const { data, isLoading, isError, refetch } = useIncidentStats();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-lg bg-gray-100/80 dark:bg-gray-800/80" />;
  }
  if (isError || !data) {
    return (
      <button type="button" onClick={() => void refetch()} className="text-sm text-red-600 hover:underline">
        Failed to load
      </button>
    );
  }

  return (
    <StatContent
      label={t('slaBreached')}
      value={data.sla_breached}
      accent="red"
      emphasize
      icon={DashboardIcons.sla('w-5 h-5')}
      link="/incidents?sla_breached=true"
    />
  );
}

export function AssignedToMeStatWidget(_props: DashboardWidgetProps) {
  const t = useTranslations('pages.dashboard.stats');
  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useIncidentStats();
  const { data: queue, isLoading: queueLoading, isError: queueError, refetch: refetchQueue } = useMyQueue(1);

  const isLoading = statsLoading || queueLoading;
  const isError = statsError || queueError;

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-lg bg-gray-100/80 dark:bg-gray-800/80" />;
  }
  if (isError || !stats) {
    return (
      <button
        type="button"
        onClick={() => {
          void refetchStats();
          void refetchQueue();
        }}
        className="text-sm text-red-600 hover:underline"
      >
        Failed to load
      </button>
    );
  }

  const value = queue?.pagination.total || stats.assigned_to_me;

  return (
    <StatContent
      label={t('assignedToMe')}
      value={value}
      accent="emerald"
      icon={DashboardIcons.queue('w-5 h-5')}
      link="/incidents?assigned_to_me=true"
      hint={t('assignedHint')}
    />
  );
}
