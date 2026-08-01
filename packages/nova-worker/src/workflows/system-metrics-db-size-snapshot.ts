/* SPDX-License-Identifier: AGPL-3.0-only */
import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

const {
  snapshotDbSizeForAllTenants,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
  retry: { maximumAttempts: 3, initialInterval: '10 seconds' },
});

export async function systemMetricsDbSizeSnapshot(): Promise<void> {
  await snapshotDbSizeForAllTenants();
}
