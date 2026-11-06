/* SPDX-License-Identifier: AGPL-3.0-only */
import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

const { runDataManagementJob } = proxyActivities<typeof activities>({
  startToCloseTimeout: '4 hours',
  retry: { maximumAttempts: 2, initialInterval: '30 seconds' },
});

export interface DataManagementJobInput {
  jobId: string;
  tenantId: string;
}

export async function dataManagementJob(input: DataManagementJobInput): Promise<void> {
  await runDataManagementJob(input.jobId, input.tenantId);
}
