/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { admin, auth, cmdb, incidents, problems } from '@/api/client';
import { queryKeys } from './keys';

/** Reference lists for form dropdowns — change infrequently. */
export const REFERENCE_DATA_STALE_MS = 10 * 60 * 1000;
export const REFERENCE_DATA_GC_MS = 30 * 60 * 1000;

const referenceQueryDefaults = {
  staleTime: REFERENCE_DATA_STALE_MS,
  gcTime: REFERENCE_DATA_GC_MS,
} as const;

export function useReferenceAssignmentGroups(enabled = true) {
  return useQuery({
    queryKey: queryKeys.reference.assignmentGroups(),
    queryFn: () => admin.assignmentGroups().then((r) => r.assignment_groups),
    enabled,
    ...referenceQueryDefaults,
  });
}

export function useReferenceIncidentServices(enabled = true) {
  return useQuery({
    queryKey: queryKeys.reference.incidentServices(),
    queryFn: () => incidents.services().then((r) => r.services),
    enabled,
    ...referenceQueryDefaults,
  });
}

export function useReferenceUsers(enabled = true) {
  return useQuery({
    queryKey: queryKeys.reference.users(),
    queryFn: () => auth.users().then((r) => r.users),
    enabled,
    ...referenceQueryDefaults,
  });
}

export function useReferenceCmdbItems(
  params: Record<string, string> = { status: 'active' },
  page = 1,
  limit = 100,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.reference.cmdbItems(params, page, limit),
    queryFn: () => cmdb.items(params, page, limit).then((r) => r.items),
    enabled,
    ...referenceQueryDefaults,
  });
}

export function useReferenceProblemPicker(enabled = true) {
  return useQuery({
    queryKey: queryKeys.reference.problemPicker(),
    queryFn: () => problems.list({}, 1, 100).then((r) => r.problems),
    enabled,
    ...referenceQueryDefaults,
  });
}

export function createReferenceDataInvalidators(queryClient: QueryClient) {
  return {
    all: () => queryClient.invalidateQueries({ queryKey: queryKeys.reference.all }),
    assignmentGroups: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reference.assignmentGroups() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.assignmentGroups() });
    },
    incidentServices: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.reference.incidentServices() }),
    users: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reference.users() });
      // Groups embed member display names in list payloads.
      void queryClient.invalidateQueries({ queryKey: queryKeys.reference.assignmentGroups() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.assignmentGroups() });
    },
    cmdbItems: () =>
      queryClient.invalidateQueries({ queryKey: [...queryKeys.reference.all, 'cmdb-items'] }),
    problemPicker: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.reference.problemPicker() }),
  };
}

export type ReferenceDataInvalidators = ReturnType<typeof createReferenceDataInvalidators>;

export function useInvalidateReferenceData(): ReferenceDataInvalidators {
  const queryClient = useQueryClient();
  return useMemo(() => createReferenceDataInvalidators(queryClient), [queryClient]);
}
