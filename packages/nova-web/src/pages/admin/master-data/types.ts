/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ReactNode } from 'react';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
}

export interface ColumnDef<T> {
  key: string;
  label: string;
  render: (item: T) => ReactNode;
  className?: string;
  sortable?: boolean;
  defaultVisible?: boolean;
}

export function getNestedValue(obj: unknown, key: string): unknown {
  if (key === '_status') return (obj as { is_active: boolean }).is_active ? 0 : 1;
  return (obj as Record<string, unknown>)[key];
}

export function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}
