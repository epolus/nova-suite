/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { Release } from '../types';

export const releases = {
  list: () => request<{ releases: Release[] }>('/releases'),
  create: (data: Partial<Release>) =>
    request<Release>('/releases', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Release>) =>
    request<Release>(`/releases/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};
