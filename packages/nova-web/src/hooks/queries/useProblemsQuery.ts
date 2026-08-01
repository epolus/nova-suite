/* SPDX-License-Identifier: AGPL-3.0-only */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { problems as problemsApi } from '@/api/client';
import { queryKeys } from './keys';

export function useProblemsList(
  apiParams: Record<string, string>,
  page: number,
  limit = 20,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.problems.list(apiParams, page, limit),
    queryFn: () => problemsApi.list(apiParams, page, limit),
    enabled,
  });
}

export function useProblem(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.problems.detail(id ?? ''),
    queryFn: () => problemsApi.get(id!),
    enabled: !!id,
  });
}

export function useInvalidateProblems() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.problems.all });
}
