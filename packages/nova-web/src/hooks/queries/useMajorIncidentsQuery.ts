/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { majorIncidents as majorIncidentsApi } from '@/api/client';
import { queryKeys } from './keys';
import { REFERENCE_DATA_GC_MS, REFERENCE_DATA_STALE_MS } from './useReferenceDataQuery';

export type MajorIncidentListRow = {
  id: string;
  number: string;
  title: string;
  status: string;
  priority: number;
  declared_major_at?: string | null;
  participant_count?: number;
};

export type MajorIncidentBannerItem = {
  id: string;
  number: string;
  title: string;
  status: string;
  priority: number;
};

export const LINKABLE_MAJOR_INCIDENT_PARAMS = {
  status_not_in: 'resolved,cancelled,pending_acceptance',
} as const;

export const LINKABLE_MAJOR_INCIDENT_LIMIT = 50;

export const DASHBOARD_MAJOR_INCIDENT_PARAMS = { status_not_in: 'resolved,cancelled' } as const;

export const MAJOR_INCIDENT_LIST_STALE_MS = REFERENCE_DATA_STALE_MS;
export const MAJOR_INCIDENT_BANNER_STALE_MS = 2 * 60 * 1000;
export const MAJOR_INCIDENT_BANNER_REFETCH_MS = 60_000;

const listQueryDefaults = {
  staleTime: MAJOR_INCIDENT_LIST_STALE_MS,
  gcTime: REFERENCE_DATA_GC_MS,
} as const;

export function useMajorIncidentsList(
  apiParams: Record<string, string>,
  page: number,
  limit = 20,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.majorIncidents.list(apiParams, page, limit),
    queryFn: () => majorIncidentsApi.list(apiParams, page, limit),
    enabled,
    ...listQueryDefaults,
  });
}

export function useLinkableMajorIncidents(enabled = true) {
  return useQuery({
    queryKey: queryKeys.majorIncidents.list(
      LINKABLE_MAJOR_INCIDENT_PARAMS,
      1,
      LINKABLE_MAJOR_INCIDENT_LIMIT,
    ),
    queryFn: () =>
      majorIncidentsApi.list(LINKABLE_MAJOR_INCIDENT_PARAMS, 1, LINKABLE_MAJOR_INCIDENT_LIMIT),
    enabled,
    ...listQueryDefaults,
    select: (data) => data.major_incidents as MajorIncidentListRow[],
  });
}

export function useDashboardActiveMajorIncidents(enabled = true) {
  return useQuery({
    queryKey: queryKeys.majorIncidents.list(DASHBOARD_MAJOR_INCIDENT_PARAMS, 1, 8),
    queryFn: () => majorIncidentsApi.list(DASHBOARD_MAJOR_INCIDENT_PARAMS, 1, 8),
    enabled,
    ...listQueryDefaults,
    select: (data) => data.major_incidents as MajorIncidentListRow[],
  });
}

export function useMajorIncidentsActiveBanner(enabled = true) {
  return useQuery({
    queryKey: queryKeys.majorIncidents.activeBanner(),
    queryFn: () => majorIncidentsApi.activeBanner(),
    enabled,
    staleTime: MAJOR_INCIDENT_BANNER_STALE_MS,
    gcTime: REFERENCE_DATA_GC_MS,
    refetchInterval: MAJOR_INCIDENT_BANNER_REFETCH_MS,
    select: (data) => (data.items ?? []) as MajorIncidentBannerItem[],
  });
}

export function createMajorIncidentsInvalidators(queryClient: QueryClient) {
  return {
    all: () => queryClient.invalidateQueries({ queryKey: queryKeys.majorIncidents.all }),
    lists: () => queryClient.invalidateQueries({ queryKey: queryKeys.majorIncidents.lists() }),
    activeBanner: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.majorIncidents.activeBanner() }),
    detail: (id: string) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.majorIncidents.detail(id) }),
    /** Lists + banner after create, resolve, link, etc. */
    summaries: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.majorIncidents.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.majorIncidents.activeBanner() });
    },
  };
}

export type MajorIncidentsInvalidators = ReturnType<typeof createMajorIncidentsInvalidators>;

export function useInvalidateMajorIncidents(): MajorIncidentsInvalidators {
  const queryClient = useQueryClient();
  return useMemo(() => createMajorIncidentsInvalidators(queryClient), [queryClient]);
}
