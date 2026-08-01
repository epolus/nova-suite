/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ReportDatasetKey } from '@/api/types/reports';
import type { DashboardWidgetInstance } from './types';

export const TREND_DAY_OPTIONS = [7, 30, 90] as const;
export type TrendDayOption = (typeof TREND_DAY_OPTIONS)[number];

export interface TrendWidgetConfig {
  dataset: ReportDatasetKey;
  metric: string;
  days?: TrendDayOption;
}

export const DEFAULT_TREND_CONFIG: TrendWidgetConfig = {
  dataset: 'incidents',
  metric: 'opened',
  days: 30,
};

export function parseTrendWidgetConfig(instance: DashboardWidgetInstance): TrendWidgetConfig {
  const raw = instance.config ?? {};
  const dataset = raw.dataset === 'changes' || raw.dataset === 'requests' || raw.dataset === 'incidents'
    ? raw.dataset
    : DEFAULT_TREND_CONFIG.dataset;
  const metric = typeof raw.metric === 'string' && raw.metric.trim() ? raw.metric : DEFAULT_TREND_CONFIG.metric;
  const daysNum = Number(raw.days ?? DEFAULT_TREND_CONFIG.days);
  const days = TREND_DAY_OPTIONS.includes(daysNum as TrendDayOption)
    ? (daysNum as TrendDayOption)
    : DEFAULT_TREND_CONFIG.days;
  return { dataset, metric, days };
}

export function trendConfigKey(config: TrendWidgetConfig): string {
  return `${config.dataset}:${config.metric}:${config.days ?? 30}`;
}
