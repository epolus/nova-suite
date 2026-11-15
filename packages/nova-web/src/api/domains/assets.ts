/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { Asset, AssetAssignment } from '../types';

export const assets = {
  list: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params);
    const suffix = qs.size ? `?${qs}` : '';
    return request<{ assets: Asset[] }>(`/assets${suffix}`);
  },
  get: (id: string) => request<Asset>(`/assets/${id}`),
  create: (data: Partial<Asset>) =>
    request<Asset>('/assets', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Asset>) =>
    request<Asset>(`/assets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  assignments: (id: string) =>
    request<{ assignments: AssetAssignment[] }>(`/assets/${id}/assignments`),
  assign: (id: string, data: { user_id: string; notes?: string | null }) =>
    request<{ assignment: AssetAssignment; asset: Asset }>(`/assets/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  returnAssignment: (id: string, data: { notes?: string | null } = {}) =>
    request<{ assignment: AssetAssignment; asset: Asset }>(`/assets/${id}/return`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
