/* SPDX-License-Identifier: AGPL-3.0-only */

export const PRIORITY_CONFIG: Record<number, { color: string; bg: string; dot: string }> = {
  1: { color: 'text-red-700', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
  2: { color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  3: { color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-500' },
  4: { color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', dot: 'bg-gray-400' },
  5: { color: 'text-gray-500', bg: 'bg-gray-50 border-gray-100', dot: 'bg-gray-300' },
};
