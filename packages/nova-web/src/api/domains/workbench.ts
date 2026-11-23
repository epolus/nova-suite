/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';

export type WorkbenchBucket = 'mine' | 'unassigned' | 'sla' | 'major';
export type WorkbenchRecordKind = 'incident' | 'problem' | 'change' | 'major_incident';

export type WorkbenchQueueItem = {
  kind: 'incident' | 'major_incident';
  id: string;
  number: string;
  title: string;
  priority: number | null;
  status: string;
  sla_due_at: string | null;
  sla_breached: boolean;
  vip: boolean;
  assignment_group_name: string | null;
  updated_at: string;
};

export type WorkbenchResolvedRecord = {
  kind: WorkbenchRecordKind;
  id: string;
  number: string;
};

export const workbench = {
  queue: (params: { bucket: WorkbenchBucket; search?: string; limit?: number }) => {
    const qs = new URLSearchParams({
      bucket: params.bucket,
      limit: String(params.limit ?? 50),
    });
    if (params.search) qs.set('search', params.search);
    return request<{ items: WorkbenchQueueItem[] }>(`/workbench/queue?${qs}`);
  },
  resolve: (numbers: string[]) => {
    const qs = new URLSearchParams({ numbers: numbers.join(',') });
    return request<{ records: WorkbenchResolvedRecord[] }>(`/workbench/resolve?${qs}`);
  },
};
