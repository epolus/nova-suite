/* SPDX-License-Identifier: AGPL-3.0-only */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { requests as requestsApi } from '@/api/client';
import { queryKeys } from './keys';

export function useRequestsList(
  apiParams: Record<string, string>,
  page: number,
  limit = 20,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.requests.list(apiParams, page, limit),
    queryFn: () => requestsApi.list(apiParams, page, limit),
    enabled,
  });
}

export function useRequest(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.requests.detail(id ?? ''),
    queryFn: () => requestsApi.get(id!),
    enabled: !!id,
  });
}

export function useRequestTasks(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.requests.tasks(id ?? ''),
    queryFn: () => requestsApi.tasks(id!).then((r) => r.tasks),
    enabled: !!id,
  });
}

export function useInvalidateRequests() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.requests.all });
}
