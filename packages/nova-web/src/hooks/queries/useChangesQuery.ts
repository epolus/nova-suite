/* SPDX-License-Identifier: AGPL-3.0-only */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { changes as changesApi } from '@/api/client';
import { queryKeys } from './keys';

export function useChangesList(
  apiParams: Record<string, string>,
  page: number,
  limit = 20,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.changes.list(apiParams, page, limit),
    queryFn: () => changesApi.list(apiParams, page, limit),
    enabled,
  });
}

export function useChange(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.changes.detail(id ?? ''),
    queryFn: () => changesApi.get(id!),
    enabled: !!id,
  });
}

export function useInvalidateChanges() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.changes.all });
}
