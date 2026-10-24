/* SPDX-License-Identifier: AGPL-3.0-only */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { incidents as incidentsApi } from '@/api/client';
import type { Incident } from '@/api/client';
import { queryKeys } from './keys';

export function useIncidentsList(
  apiParams: Record<string, string>,
  page: number,
  limit = 20,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.incidents.list(apiParams, page, limit),
    queryFn: () => incidentsApi.list(apiParams, page, limit),
    enabled,
  });
}

export function useIncidentAssignmentGroups() {
  return useQuery({
    queryKey: queryKeys.incidents.assignmentGroups(),
    queryFn: () => incidentsApi.assignmentGroups().then((r) => r.assignment_groups),
  });
}

export function useIncidentLinkedProblems(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.incidents.linkedProblems(id ?? ''),
    queryFn: () => incidentsApi.linkedProblems(id!).then((r) => r.problems),
    enabled: !!id && enabled,
    staleTime: 30_000,
  });
}

export function useInvalidateIncidents() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all });
}

export type { Incident };
