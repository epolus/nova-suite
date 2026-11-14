/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type {
  WorkLog,
  WorkLogCreatePayload,
  WorkLogEntityType,
  WorkLogUpdatePayload,
} from '../types/workLogs';

export const workLogs = {
  list: (entityType: WorkLogEntityType, entityId: string) =>
    request<{ work_logs: WorkLog[]; total_minutes: number }>(
      `/work-logs?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`,
    ),
  create: (data: WorkLogCreatePayload) =>
    request<WorkLog>('/work-logs', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: WorkLogUpdatePayload) =>
    request<WorkLog>(`/work-logs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) =>
    request<{ success: boolean }>(`/work-logs/${id}`, { method: 'DELETE' }),
};
