/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type {
  DataManagementAction,
  DataManagementFilter,
  DataManagementJob,
  DataManagementPreview,
  DataManagementTarget,
} from '../types';

export interface DataManagementRequest {
  target: 'incidents';
  action: DataManagementAction;
  filters: DataManagementFilter[];
  include_open: boolean;
}

export const dataManagement = {
  targets: () => request<{ targets: DataManagementTarget[] }>('/data-management/targets'),
  preview: (body: DataManagementRequest) =>
    request<DataManagementPreview>('/data-management/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createJob: (body: DataManagementRequest & { confirm_count: number }) =>
    request<{ job: DataManagementJob }>('/data-management/jobs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  jobs: () => request<{ jobs: DataManagementJob[] }>('/data-management/jobs'),
  job: (id: string) => request<{ job: DataManagementJob }>(`/data-management/jobs/${id}`),
};
