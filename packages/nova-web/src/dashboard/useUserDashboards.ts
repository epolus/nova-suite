/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboards as dashboardsApi, type UserDashboard } from '@/api/domains/dashboards';
import { useUserPreferenceState } from '@/hooks/useUserPreferenceState';
import { buildDefaultDashboardLayout } from './defaults';
import { sanitizeDashboardLayout } from './layoutUtils';
import { DASHBOARD_ACTIVE_ID_SCOPE, MAX_USER_DASHBOARDS } from './constants';
import type { DashboardLayout } from './types';

const DASHBOARDS_QUERY_KEY = ['dashboards'] as const;
const EMPTY_DASHBOARDS: UserDashboard[] = [];

export function useUserDashboards(roles: string[] | undefined) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useUserPreferenceState<string | null>(DASHBOARD_ACTIVE_ID_SCOPE, null);
  const seededDashboardIdsRef = useRef(new Set<string>());

  const { data, isLoading, isError } = useQuery({
    queryKey: DASHBOARDS_QUERY_KEY,
    queryFn: () => dashboardsApi.list(),
  });

  const dashboardsList = useMemo(
    () => data?.dashboards ?? EMPTY_DASHBOARDS,
    [data?.dashboards],
  );

  const effectiveActiveId = useMemo(() => {
    if (activeId && dashboardsList.some((d) => d.id === activeId)) return activeId;
    const defaultDashboard = dashboardsList.find((d) => d.is_default);
    return defaultDashboard?.id ?? dashboardsList[0]?.id ?? null;
  }, [activeId, dashboardsList]);

  useEffect(() => {
    if (!effectiveActiveId || dashboardsList.length === 0) return;
    if (activeId !== effectiveActiveId && (!activeId || !dashboardsList.some((d) => d.id === activeId))) {
      setActiveId(effectiveActiveId);
    }
  }, [activeId, dashboardsList, effectiveActiveId, setActiveId]);

  const activeDashboard = useMemo(() => {
    const dashboard = dashboardsList.find((d) => d.id === effectiveActiveId);
    if (!dashboard) return undefined;
    return {
      ...dashboard,
      layout: dashboard.layout as DashboardLayout,
    };
  }, [dashboardsList, effectiveActiveId]);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: DASHBOARDS_QUERY_KEY });
  }, [queryClient]);

  const updateLayoutMutation = useMutation({
    mutationFn: ({ id, layout }: { id: string; layout: DashboardLayout }) =>
      dashboardsApi.update(id, { layout }),
    onSuccess: (res) => {
      queryClient.setQueryData<{ dashboards: UserDashboard[] }>(DASHBOARDS_QUERY_KEY, (prev) => {
        if (!prev) return prev;
        return {
          dashboards: prev.dashboards.map((d) => (d.id === res.dashboard.id ? res.dashboard : d)),
        };
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; is_default?: boolean }) =>
      dashboardsApi.create({
        name: payload.name,
        layout: buildDefaultDashboardLayout(roles),
        is_default: payload.is_default,
      }),
    onSuccess: (res) => {
      invalidate();
      setActiveId(res.dashboard.id);
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      dashboardsApi.update(id, { name }),
    onSuccess: invalidate,
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => dashboardsApi.update(id, { is_default: true }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dashboardsApi.remove(id),
    onSuccess: (_res, deletedId) => {
      if (activeId === deletedId) {
        setActiveId(null);
      }
      invalidate();
    },
  });

  const saveLayout = useCallback((layout: DashboardLayout) => {
    if (!effectiveActiveId) return;
    updateLayoutMutation.mutate({ id: effectiveActiveId, layout });
  }, [effectiveActiveId, updateLayoutMutation]);

  useEffect(() => {
    if (isLoading || !activeDashboard || updateLayoutMutation.isPending) return;

    if (activeDashboard.layout.widgets.length > 0) {
      seededDashboardIdsRef.current.add(activeDashboard.id);
      return;
    }

    if (seededDashboardIdsRef.current.has(activeDashboard.id)) return;

    const defaultLayout = sanitizeDashboardLayout(buildDefaultDashboardLayout(roles), roles);
    if (defaultLayout.widgets.length === 0) return;

    seededDashboardIdsRef.current.add(activeDashboard.id);
    updateLayoutMutation.mutate({ id: activeDashboard.id, layout: defaultLayout });
  }, [activeDashboard, isLoading, roles, updateLayoutMutation]);

  const selectDashboard = useCallback((id: string) => {
    setActiveId(id);
  }, [setActiveId]);

  return {
    dashboards: dashboardsList,
    isLoading,
    isError,
    activeId: effectiveActiveId,
    activeDashboard,
    selectDashboard,
    saveLayout,
    createDashboard: (name: string) => createMutation.mutateAsync({ name }).then(() => undefined),
    renameDashboard: renameMutation.mutateAsync,
    setDefaultDashboard: (id: string) => setDefaultMutation.mutateAsync(id).then(() => undefined),
    deleteDashboard: (id: string) => deleteMutation.mutateAsync(id).then(() => undefined),
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    canCreateMore: dashboardsList.length < MAX_USER_DASHBOARDS,
  };
}
