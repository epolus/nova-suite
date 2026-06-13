/* SPDX-License-Identifier: AGPL-3.0-only */
import { useQuery } from '@tanstack/react-query';
import { requests } from '@/api/client';
import { useDashboardActiveMajorIncidents } from '@/hooks/queries';
import { dashboardQueryKeys } from './keys';

export function useOpenRequestsCount(enabled = true) {
  return useQuery({
    queryKey: dashboardQueryKeys.openRequestsCount(),
    queryFn: () => requests.list({ active: 'true' }, 1, 1),
    enabled,
    staleTime: 30_000,
    select: (data) => data.pagination.total,
  });
}

export function useRecentRequests(limit: number, enabled = true) {
  return useQuery({
    queryKey: dashboardQueryKeys.recentRequests(limit),
    queryFn: () => requests.list({ active: 'true' }, 1, limit),
    enabled,
    staleTime: 60_000,
  });
}

export function useActiveMajorIncidents(enabled = true) {
  return useDashboardActiveMajorIncidents(enabled);
}
