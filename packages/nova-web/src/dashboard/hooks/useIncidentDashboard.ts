/* SPDX-License-Identifier: AGPL-3.0-only */
import { useQuery } from '@tanstack/react-query';
import { incidents } from '@/api/client';
import { dashboardQueryKeys } from './keys';

export function useIncidentStats(enabled = true) {
  return useQuery({
    queryKey: dashboardQueryKeys.incidentStats(),
    queryFn: () => incidents.stats(),
    enabled,
    staleTime: 30_000,
  });
}

export function useMyQueue(limit: number, enabled = true) {
  return useQuery({
    queryKey: dashboardQueryKeys.myQueue(limit),
    queryFn: () => incidents.list({ assigned_to_me: 'true' }, 1, limit),
    enabled,
    staleTime: 60_000,
  });
}
