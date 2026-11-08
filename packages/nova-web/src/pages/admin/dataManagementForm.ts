/* SPDX-License-Identifier: AGPL-3.0-only */
import type {
  DataManagementField,
  DataManagementFilter,
  DataManagementOperator,
  DataManagementUnit,
} from '../../api/client';

export interface FilterRow {
  field: string;
  operator: DataManagementOperator;
  text: string;
  amount: string;
  unit: DataManagementUnit;
  list: string;
  bool: 'true' | 'false';
}

export const fieldInputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden';

export function defaultFilterRow(field?: DataManagementField): FilterRow {
  return {
    field: field?.key ?? 'created_at',
    operator: !field || field.operators.includes('older_than') ? 'older_than' : (field.operators[0] ?? 'eq'),
    text: '',
    amount: '2',
    unit: 'years',
    list: '',
    bool: 'true',
  };
}

export function rowToFilter(row: FilterRow, field: DataManagementField | undefined): DataManagementFilter | null {
  if (!field) return null;
  if (row.operator === 'older_than') {
    const amount = Number(row.amount);
    if (!Number.isInteger(amount) || amount < 1) return null;
    return { field: row.field, operator: 'older_than', value: { amount, unit: row.unit } };
  }
  if (row.operator === 'in') {
    const parts = row.list.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    if (field.type === 'number') {
      const numbers = parts.map(Number);
      if (numbers.some((value) => Number.isNaN(value))) return null;
      return { field: row.field, operator: 'in', value: numbers };
    }
    return { field: row.field, operator: 'in', value: parts };
  }
  if (field.type === 'boolean') {
    return { field: row.field, operator: row.operator, value: row.bool === 'true' };
  }
  if (field.type === 'number') {
    const value = Number(row.text);
    if (row.text.trim() === '' || Number.isNaN(value)) return null;
    return { field: row.field, operator: row.operator, value };
  }
  if (field.type === 'timestamp') {
    if (!row.text) return null;
    const parsed = new Date(row.text);
    if (Number.isNaN(parsed.getTime())) return null;
    return { field: row.field, operator: row.operator, value: parsed.toISOString() };
  }
  if (!row.text.trim()) return null;
  return { field: row.field, operator: row.operator, value: row.text.trim() };
}
