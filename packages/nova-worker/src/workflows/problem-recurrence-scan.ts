/* SPDX-License-Identifier: AGPL-3.0-only */
import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

const {
  scanProblemRecurrenceForAllTenants,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: { maximumAttempts: 3, initialInterval: '10 seconds' },
});

export async function problemRecurrenceScan(): Promise<{ tenants: number; candidates: number }> {
  return scanProblemRecurrenceForAllTenants();
}
