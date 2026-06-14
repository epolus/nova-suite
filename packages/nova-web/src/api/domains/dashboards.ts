/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';

export interface DashboardLayoutPayload {
  version: 1;
  widgets: Array<{
    id: string;
    type: string;
    x: number;
    y: number;
    w: number;
    h: number;
    config?: Record<string, unknown>;
  }>;
}

export interface UserDashboard {
  id: string;
  name: string;
  layout: DashboardLayoutPayload;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const dashboards = {
  list: () => request<{ dashboards: UserDashboard[] }>('/dashboards'),
  create: (payload: { name: string; layout?: DashboardLayoutPayload; is_default?: boolean }) =>
    request<{ dashboard: UserDashboard }>('/dashboards', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: { name?: string; layout?: DashboardLayoutPayload; is_default?: boolean }) =>
    request<{ dashboard: UserDashboard }>(`/dashboards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  remove: (id: string) =>
    request<{ success: boolean }>(`/dashboards/${id}`, { method: 'DELETE' }),
};
