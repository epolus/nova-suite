/* SPDX-License-Identifier: AGPL-3.0-only */

export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  incidentStats: () => [...dashboardQueryKeys.all, 'incident-stats'] as const,
  changeStats: () => [...dashboardQueryKeys.all, 'change-stats'] as const,
  myQueue: (limit: number) => [...dashboardQueryKeys.all, 'my-queue', limit] as const,
  pendingChanges: (limit: number) => [...dashboardQueryKeys.all, 'pending-changes', limit] as const,
  recentRequests: (limit: number) => [...dashboardQueryKeys.all, 'recent-requests', limit] as const,
  majorIncidents: () => [...dashboardQueryKeys.all, 'major-incidents'] as const,
  openRequestsCount: () => [...dashboardQueryKeys.all, 'open-requests-count'] as const,
};
