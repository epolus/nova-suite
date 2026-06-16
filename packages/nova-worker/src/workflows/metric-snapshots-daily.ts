/* SPDX-License-Identifier: AGPL-3.0-only */
import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

const {
  snapshotTrendMetricsForAllTenants,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: { maximumAttempts: 3, initialInterval: '10 seconds' },
});

export async function metricSnapshotsDaily(): Promise<void> {
  await snapshotTrendMetricsForAllTenants();
}
