/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';

export type RotaShift = {
  id: string;
  assignment_group_id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assignment_group_name?: string;
  user_name?: string;
  created_by_name?: string;
};

export type OnCallCovering = {
  user_id: string;
  user_name: string;
  shift_id: string;
};

export const rota = {
  listShifts: (params: { from: string; to: string; assignment_group_id?: string }) => {
    const qs = new URLSearchParams({ from: params.from, to: params.to });
    if (params.assignment_group_id) qs.set('assignment_group_id', params.assignment_group_id);
    return request<{ shifts: RotaShift[] }>(`/rota/shifts?${qs}`);
  },
  onCall: (assignment_group_id: string, at?: string) => {
    const qs = new URLSearchParams({ assignment_group_id });
    if (at) qs.set('at', at);
    return request<{ on_call: OnCallCovering | null }>(`/rota/on-call?${qs}`);
  },
  createShift: (data: {
    assignment_group_id: string;
    user_id: string;
    starts_at: string;
    ends_at: string;
    notes?: string | null;
  }) =>
    request<RotaShift>('/rota/shifts', { method: 'POST', body: JSON.stringify(data) }),
  updateShift: (
    id: string,
    data: Partial<{
      assignment_group_id: string;
      user_id: string;
      starts_at: string;
      ends_at: string;
      notes: string | null;
    }>,
  ) =>
    request<RotaShift>(`/rota/shifts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteShift: (id: string) =>
    request<{ success: boolean }>(`/rota/shifts/${id}`, { method: 'DELETE' }),
};
