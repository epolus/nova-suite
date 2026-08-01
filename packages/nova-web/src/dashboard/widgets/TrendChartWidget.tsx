/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import TrendChart from '../components/TrendChart';
import { useTrendSeries } from '../hooks/useTrendSeries';
import { parseTrendWidgetConfig } from '../trendConfig';
import type { DashboardWidgetProps } from '../types';

export default function TrendChartWidget({ instance }: DashboardWidgetProps) {
  const tStates = useTranslations('common.states');
  const tAnalytics = useTranslations('pages.dashboard.analytics');
  const config = parseTrendWidgetConfig(instance);
  const { data, isLoading, error } = useTrendSeries(config.dataset, config.metric, config.days ?? 30);
  const summaryMode = data?.kind === 'snapshot' ? 'latest' : 'sum';
  const summaryLabel = data?.kind === 'snapshot' ? tAnalytics('current') : tAnalytics('total');

  return (
    <div className="flex h-full flex-col px-1 py-1">
      <div className="flex-1 min-h-0">
        <TrendChart
          points={data?.points ?? []}
          loading={isLoading}
          error={error instanceof Error ? error.message : undefined}
          emptyLabel={tStates('noData')}
          summaryMode={summaryMode}
          summaryLabel={summaryLabel}
        />
      </div>
    </div>
  );
}
