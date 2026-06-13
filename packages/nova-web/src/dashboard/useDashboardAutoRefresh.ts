/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUserPreferenceState } from '@/hooks/useUserPreferenceState';
import {
  DASHBOARD_AUTO_REFRESH_LEGACY_KEY,
  DASHBOARD_AUTO_REFRESH_OPTIONS,
  DASHBOARD_AUTO_REFRESH_SCOPE,
} from './constants';
import { dashboardQueryKeys } from './hooks/keys';

export function useDashboardAutoRefresh() {
  const queryClient = useQueryClient();
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useUserPreferenceState<number>(
    DASHBOARD_AUTO_REFRESH_SCOPE,
    0,
    DASHBOARD_AUTO_REFRESH_LEGACY_KEY,
  );

  useEffect(() => {
    const allowed = new Set<number>(DASHBOARD_AUTO_REFRESH_OPTIONS);
    if (!allowed.has(autoRefreshSeconds)) {
      setAutoRefreshSeconds(0);
    }
  }, [autoRefreshSeconds, setAutoRefreshSeconds]);

  useEffect(() => {
    if (autoRefreshSeconds <= 0) return;

    const timer = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all });
    }, autoRefreshSeconds * 1000);

    return () => window.clearInterval(timer);
  }, [autoRefreshSeconds, queryClient]);

  return { autoRefreshSeconds, setAutoRefreshSeconds };
}
