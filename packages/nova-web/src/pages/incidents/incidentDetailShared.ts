/* SPDX-License-Identifier: AGPL-3.0-only */
import type { useIncidentDetail } from './useIncidentDetail';

export type IncidentDetailState = ReturnType<typeof useIncidentDetail>;

export function getInputCls(readonly: boolean): string {
  return `w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none${readonly ? ' bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`;
}
