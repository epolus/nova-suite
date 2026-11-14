/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type {
  RecordLink,
  RecordLinkEntityType,
  RecordLinkSearchHit,
  RecordLinkType,
} from '../types/recordLinks';

export const recordLinks = {
  list: (entityType: RecordLinkEntityType, entityId: string) =>
    request<{ links: RecordLink[] }>(
      `/record-links?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`,
    ),
  search: (entityType: RecordLinkEntityType, q: string, limit = 15) => {
    const qs = new URLSearchParams({
      entity_type: entityType,
      q,
      limit: String(limit),
    });
    return request<{ results: RecordLinkSearchHit[] }>(`/record-links/search?${qs}`);
  },
  create: (data: {
    source_type: RecordLinkEntityType;
    source_id: string;
    target_type: RecordLinkEntityType;
    target_id: string;
    link_type?: RecordLinkType;
  }) =>
    request<RecordLink>('/record-links', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<{ success: boolean }>(`/record-links/${id}`, { method: 'DELETE' }),
};
