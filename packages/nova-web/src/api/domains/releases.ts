/* SPDX-License-Identifier: AGPL-3.0-only */
import type { CreateReleaseInput, UpdateReleaseInput } from '@nova-suite/shared/schemas';
import { request } from '../http';
import type { Release } from '../types';

export const releases = {
  list: () => request<{ releases: Release[] }>('/releases'),
  get: (id: string) => request<Release>(`/releases/${id}`),
  create: (data: CreateReleaseInput) =>
    request<Release>('/releases', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: UpdateReleaseInput) =>
    request<Release>(`/releases/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};
