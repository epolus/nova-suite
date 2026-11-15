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

export function useIncidentDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.incidents.detail(id ?? ''),
    queryFn: () => incidentsApi.get(id!),
    enabled: !!id,
  });
}

export function useIncidentJournal(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.incidents.journal(id ?? ''),
    queryFn: () => incidentsApi.journal(id!).then((r) => r.entries),
    enabled: !!id,
  });
}

/** Previous/next incident within the list the user came from. */
export function useIncidentNav(id: string | undefined, listParams: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.incidents.nav(id ?? '', listParams),
    queryFn: () => incidentsApi.nav(id!, listParams),
    enabled: !!id,
    staleTime: 60_000,
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
