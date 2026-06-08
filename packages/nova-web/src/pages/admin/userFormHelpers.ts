/* SPDX-License-Identifier: AGPL-3.0-only */
import type { AdminUser } from '../../api/client';

export interface UserFormState {
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  user_id: string;
  password: string;
  title: string;
  phone: string;
  mobile: string;
  location: string;
  timezone: string;
  time_format: string;
  date_format: string;
  employee_type: string;
  company: string;
  preferred_language: string;
  start_date: string;
  last_working_date: string;
  manager_id: string;
  department_id: string;
  cost_center_id: string;
  is_active: boolean;
  role_ids: string[];
}

export const EMPTY_USER_FORM: UserFormState = {
  first_name: '',
  last_name: '',
  display_name: '',
  email: '',
  user_id: '',
  password: '',
  title: '',
  phone: '+41',
  mobile: '',
  location: 'Zurich',
  timezone: 'UTC',
  time_format: '24h',
  date_format: 'YYYY-MM-DD',
  employee_type: 'employee',
  company: '',
  preferred_language: 'en',
  start_date: '',
  last_working_date: '',
  manager_id: '',
  department_id: '',
  cost_center_id: '',
  is_active: true,
  role_ids: [],
};

export function userToForm(user: AdminUser): UserFormState {
  return {
    first_name: user.first_name ?? '',
    last_name: user.last_name ?? '',
    display_name: user.display_name ?? '',
    email: user.email ?? '',
    user_id: user.user_id ?? '',
    password: '',
    title: user.title ?? '',
    phone: user.phone ?? '',
    mobile: user.mobile ?? '',
    location: user.location ?? '',
    timezone: user.timezone ?? 'UTC',
    time_format: user.time_format ?? '24h',
    date_format: user.date_format ?? 'YYYY-MM-DD',
    employee_type: user.employee_type ?? 'employee',
    company: user.company ?? '',
    preferred_language: user.preferred_language ?? 'en',
    start_date: toDateOnly(user.start_date),
    last_working_date: toDateOnly(user.last_working_date),
    manager_id: user.manager_id ?? '',
    department_id: user.department_id ?? '',
    cost_center_id: user.cost_center_id ?? '',
    is_active: user.is_active ?? true,
    role_ids: user.role_details?.map((r) => r.id) ?? [],
  };
}

export function buildDisplayName(firstName: string, lastName: string, userId: string): string {
  const parts: string[] = [];
  if (lastName) parts.push(lastName);
  if (firstName) parts.push(firstName);
  const name = lastName && firstName ? `${lastName}, ${firstName}` : parts.join(' ');
  if (!name) return '';
  return userId ? `${name} (${userId})` : name;
}

export function toDateOnly(value: string | null | undefined): string {
  if (!value) return '';
  const raw = String(value).trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? raw;
}

function normalizePhoneForValidation(value: string): string {
  return value.trim().replace(/[()\-\s]/g, '');
}

export function validateE164PhoneField(value: string, fieldLabel: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = normalizePhoneForValidation(trimmed);
  if (!/^\+[1-9]\d{1,14}$/.test(normalized)) {
    return `${fieldLabel} must be a valid E.164 number (example: +41791234567).`;
  }
  return null;
}

export function getSortValue(user: AdminUser, key: string): unknown {
  if (key === 'user') return user.display_name;
  if (key === '_status') return user.is_active ? 0 : 1;
  return (user as unknown as Record<string, unknown>)[key];
}

export function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}
