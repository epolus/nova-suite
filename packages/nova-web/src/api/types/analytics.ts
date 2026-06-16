/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ReportDatasetKey } from './reports';

export type TrendInterval = 'day';

export interface TrendPoint {
  date: string;
  value: number;
}

export interface TrendSeriesResponse {
  dataset: ReportDatasetKey;
  metric: string;
  kind: 'count_by_date' | 'snapshot';
  days: number;
  interval: TrendInterval;
  points: TrendPoint[];
  meta?: { total?: number };
}

export interface TrendCatalogMetric {
  dataset: ReportDatasetKey;
  metric: string;
  kind: 'count_by_date' | 'snapshot';
  labelKey: string;
  defaultDays: number;
  intervals: TrendInterval[];
}

export interface TrendCatalogResponse {
  metrics: TrendCatalogMetric[];
}
