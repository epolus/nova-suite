/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { User, UserListItem } from '../types';

export const auth = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ user: User }>('/auth/me'),
  updateTimeFormat: (time_format: '12h' | '24h') =>
    request<{ user: User }>('/auth/me/time-format', {
      method: 'PATCH',
      body: JSON.stringify({ time_format }),
    }),
  updateDateFormat: (date_format: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD') =>
    request<{ user: User }>('/auth/me/date-format', {
      method: 'PATCH',
      body: JSON.stringify({ date_format }),
    }),
  getPreference: (scope: string) =>
    request<{ preference: Record<string, unknown> | null }>(`/auth/me/preferences/${encodeURIComponent(scope)}`),
  setPreference: (scope: string, value: Record<string, unknown>) =>
    request<{ success: boolean }>(`/auth/me/preferences/${encodeURIComponent(scope)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
  users: () => request<{ users: UserListItem[] }>('/auth/users'),
  ssoConfig: () =>
    request<{ enabled: boolean; provider_name: string; local_login_enabled?: boolean }>('/auth/sso/config'),
  exchangeSsoCode: (code: string) =>
    request<{ token: string; user: User }>('/auth/sso/exchange', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
};
