/* SPDX-License-Identifier: AGPL-3.0-only */
import { useQuery } from '@tanstack/react-query';
import { analytics } from '@/api/client';
import type { ReportDatasetKey } from '@/api/types/reports';
import { dashboardQueryKeys } from './keys';

export function useTrendCatalog(enabled = true) {
  return useQuery({
    queryKey: dashboardQueryKeys.trendCatalog(),
    queryFn: () => analytics.trendCatalog(),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useTrendSeries(
  dataset: ReportDatasetKey,
  metric: string,
  days: number,
  enabled = true,
) {
  return useQuery({
    queryKey: dashboardQueryKeys.trendSeries(dataset, metric, days),
    queryFn: () => analytics.trend({ dataset, metric, days }),
    enabled: enabled && Boolean(dataset && metric),
    staleTime: 60_000,
  });
}
