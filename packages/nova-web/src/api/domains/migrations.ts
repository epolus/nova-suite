/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type {
  MigrationApplyResponse,
  MigrationConfigPackage,
  MigrationRunDetail,
  MigrationRunSummary,
  ServiceNowCatalogBrowse,
  ServiceNowConnection,
  ServiceNowExtractOptions,
  ServiceNowProbeResult,
} from '../types/migrations';

const BASE = '/admin/migrations/servicenow';

export const migrations = {
  serviceNowTestConnection: (conn: ServiceNowConnection) =>
    request<ServiceNowProbeResult>(`${BASE}/test-connection`, { method: 'POST', body: JSON.stringify(conn) }),
  serviceNowCatalogs: (conn: ServiceNowConnection) =>
    request<ServiceNowCatalogBrowse>(`${BASE}/catalogs?${new URLSearchParams({ ...conn }).toString()}`),
  serviceNowStartRun: (conn: ServiceNowConnection, options: Partial<ServiceNowExtractOptions>) =>
    request<{ id: string; status: string }>(`${BASE}/runs`, {
      method: 'POST',
      body: JSON.stringify({ ...conn, options }),
    }),
  serviceNowRuns: () => request<{ runs: MigrationRunSummary[] }>(`${BASE}/runs`),
  serviceNowRun: (id: string) => request<{ run: MigrationRunDetail }>(`${BASE}/runs/${encodeURIComponent(id)}`),
  serviceNowRunPackage: (id: string) =>
    request<{ package: MigrationConfigPackage }>(`${BASE}/runs/${encodeURIComponent(id)}/package`),
  serviceNowApply: (id: string, body: { item_keys: string[]; create_missing_groups: boolean }) =>
    request<MigrationApplyResponse>(`${BASE}/runs/${encodeURIComponent(id)}/apply`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
