/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { SearchResult } from '../types';

export const search = {
  query: (q: string, limit = 20, type?: string) => {
    const qs = new URLSearchParams({ q, limit: String(limit) });
    if (type) qs.set('type', type);
    return request<{ results: SearchResult[] }>(`/search?${qs}`);
  },
};
