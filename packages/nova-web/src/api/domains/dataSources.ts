/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { DataSource, DataSourceRun, DataSourceTestResult, EntityFieldDef } from '../types';

export const dataSources = {
  list: () => request<{ data_sources: DataSource[] }>('/datasources'),
  entityTypes: () => request<{ entities: EntityFieldDef[] }>('/datasources/entity-types'),
  get: (id: string) => request<{ data_source: DataSource }>(`/datasources/${id}`),
  create: (data: Partial<DataSource>) =>
    request<{ id: string }>('/datasources', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<DataSource>) =>
    request<{ success: boolean }>(`/datasources/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/datasources/${id}`, { method: 'DELETE' }),
  run: (id: string) =>
    request<{ workflow_id: string }>(`/datasources/${id}/run`, { method: 'POST' }),
  runs: (id: string) =>
    request<{ runs: DataSourceRun[] }>(`/datasources/${id}/runs`),
  testSource: (data: {
    entity_type: string;
    source_type: DataSource['source_type'];
    source_config: DataSource['source_config'];
  }) => request<{ result: DataSourceTestResult }>('/datasources/test-source', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};
