/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { AppNotification } from '../types';

export const notifications = {
  list: () => request<{ notifications: AppNotification[] }>('/notifications'),
  unreadCount: () => request<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) =>
    request<{ success: boolean }>(`/notifications/${id}/read`, { method: 'POST', body: JSON.stringify({}) }),
  markAllRead: () =>
    request<{ success: boolean }>('/notifications/read-all', { method: 'POST', body: JSON.stringify({}) }),
  deleteAll: () =>
    request<{ success: boolean; deleted?: number }>('/notifications/delete-all', { method: 'POST', body: JSON.stringify({}) }),
};
