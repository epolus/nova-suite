/* SPDX-License-Identifier: AGPL-3.0-only */
import type { FormField } from '../api/client';

export const FIELD_TYPE_VALUES: FormField['type'][] = [
  'text', 'textarea', 'number', 'email', 'date', 'checkbox', 'select', 'multiselect', 'cmdb_ref', 'user_ref',
];

export const TYPE_COLORS: Record<string, string> = {
  text: 'bg-blue-100 text-blue-700',
  textarea: 'bg-blue-100 text-blue-700',
  number: 'bg-green-100 text-green-700',
  email: 'bg-purple-100 text-purple-700',
  date: 'bg-orange-100 text-orange-700',
  checkbox: 'bg-pink-100 text-pink-700',
  select: 'bg-cyan-100 text-cyan-700',
  multiselect: 'bg-cyan-100 text-cyan-700',
  cmdb_ref: 'bg-amber-100 text-amber-700',
  user_ref: 'bg-indigo-100 text-indigo-700',
};

export function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export const EMPTY_FIELD: FormField = {
  name: '',
  label: '',
  type: 'text',
  required: false,
};
