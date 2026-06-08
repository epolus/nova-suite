/* SPDX-License-Identifier: AGPL-3.0-only */
import { request, uploadFile, BASE } from '../http';
import type { CacheMetrics, ThemeSettings } from '../types';

export const settings = {
  theme: () => request<{ settings: ThemeSettings }>('/settings/theme'),
  get: () => request<{ settings: ThemeSettings }>('/settings'),
  cacheMetrics: () => request<{ cache: CacheMetrics }>('/settings/cache/metrics'),
  resetCacheMetrics: () => request<{ success: boolean; cache: CacheMetrics }>('/settings/cache/metrics/reset', { method: 'POST', body: JSON.stringify({}) }),
  update: (s: Partial<ThemeSettings>) =>
    request<{ success: boolean }>('/settings', { method: 'PUT', body: JSON.stringify({ settings: s }) }),
  uploadLogo: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return uploadFile<{ logo_url: string }>('/settings/logo', fd);
  },
  deleteLogo: () => request<{ success: boolean }>('/settings/logo', { method: 'DELETE' }),
  logoUrl: () => `${BASE}/settings/logo`,
};
