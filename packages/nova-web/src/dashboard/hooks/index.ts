/* SPDX-License-Identifier: AGPL-3.0-only */
export { dashboardQueryKeys } from './keys';
export { useIncidentStats, useMyQueue } from './useIncidentDashboard';
export { useChangeStats, usePendingChanges } from './useChangeDashboard';
export {
  useOpenRequestsCount,
  useRecentRequests,
  useActiveMajorIncidents,
} from './useRequestDashboard';
export { useTrendCatalog, useTrendSeries } from './useTrendSeries';
