/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { ReportDatasetKey } from '../types/reports';
import type { TrendCatalogResponse, TrendSeriesResponse } from '../types/analytics';

export const analytics = {
  trendCatalog: () => request<TrendCatalogResponse>('/analytics/trends/catalog'),
  trend: (params: {
    dataset: ReportDatasetKey;
    metric: string;
    days?: number;
    interval?: 'day';
  }) => {
    const qs = new URLSearchParams({
      dataset: params.dataset,
      metric: params.metric,
      days: String(params.days ?? 30),
      interval: params.interval ?? 'day',
    });
    return request<TrendSeriesResponse>(`/analytics/trends?${qs}`);
  },
};
