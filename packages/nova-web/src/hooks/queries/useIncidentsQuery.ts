/* SPDX-License-Identifier: AGPL-3.0-only */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

export function useIncident(id: string | undefined) {
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

export function useIncidentAssignmentGroups() {
  return useQuery({
    queryKey: queryKeys.incidents.assignmentGroups(),
    queryFn: () => incidentsApi.assignmentGroups().then((r) => r.assignment_groups),
  });
}

export function useInvalidateIncidents() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all });
}

export function useIncidentBulkUpdate() {
  const invalidate = useInvalidateIncidents();
  return useMutation({
    mutationFn: (args: { ids: string[]; action: string; value?: string }) =>
      incidentsApi.bulkUpdate(args.ids, args.action, args.value),
    onSuccess: () => invalidate(),
  });
}

export type { Incident };
