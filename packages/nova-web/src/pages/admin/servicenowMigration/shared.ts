/* SPDX-License-Identifier: AGPL-3.0-only */
import type { MigrationRunStatus } from '../../../api/client';

export type Step = 'connect' | 'select' | 'run' | 'review';

export const POLL_MS = 2000;
export const ACTIVE_STATUSES: MigrationRunStatus[] = ['queued', 'extracting', 'transforming', 'applying'];

export const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden';
export const primaryButton = 'px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors';
export const secondaryButton = 'px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50';

export const STATUS_STYLES: Record<string, string> = {
  full: 'bg-green-100 text-green-800',
  partial: 'bg-amber-100 text-amber-800',
  unsupported: 'bg-red-100 text-red-800',
  ready: 'bg-indigo-100 text-indigo-800',
  applied: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
