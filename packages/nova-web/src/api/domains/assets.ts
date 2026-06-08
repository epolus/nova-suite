/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { Asset } from '../types';

export const assets = {
  list: () => request<{ assets: Asset[] }>('/assets'),
  create: (data: Partial<Asset>) =>
    request<Asset>('/assets', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Asset>) =>
    request<Asset>(`/assets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};
