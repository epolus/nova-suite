/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { CredentialTokenTestResult, TenantCredentialDetail, TenantCredentialListItem } from '../types';

export const credentials = {
  list: () => request<{ credentials: TenantCredentialListItem[] }>('/credentials'),
  get: (id: string) => request<{ credential: TenantCredentialDetail }>(`/credentials/${id}`),
  create: (body: { slug: string; label: string; description?: string | null; secret: string }) =>
    request<{ credential: TenantCredentialListItem }>('/credentials', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (id: string, body: { label?: string; description?: string | null; secret?: string }) =>
    request<{ credential: TenantCredentialListItem }>(`/credentials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  remove: (id: string) =>
    request<void>(`/credentials/${id}`, { method: 'DELETE' }),
  testToken: (id: string) =>
    request<CredentialTokenTestResult>(`/credentials/${id}/test-token`, { method: 'POST', body: JSON.stringify({}) }),
};
