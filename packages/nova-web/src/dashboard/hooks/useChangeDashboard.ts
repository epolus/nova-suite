/* SPDX-License-Identifier: AGPL-3.0-only */
import { useQuery } from '@tanstack/react-query';
import { changes } from '@/api/client';
import { dashboardQueryKeys } from './keys';

export function useChangeStats(enabled = true) {
  return useQuery({
    queryKey: dashboardQueryKeys.changeStats(),
    queryFn: () => changes.stats(),
    enabled,
    staleTime: 30_000,
  });
}

export function usePendingChanges(limit: number, enabled = true) {
  return useQuery({
    queryKey: dashboardQueryKeys.pendingChanges(limit),
    queryFn: () => changes.list({ status: 'pending_approval' }, 1, limit),
    enabled,
    staleTime: 60_000,
  });
}
