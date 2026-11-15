/* SPDX-License-Identifier: AGPL-3.0-only */
import { patched, proxyActivities, workflowInfo } from '@temporalio/workflow';
import type * as activities from '../activities';
import { WORKFLOW_PATCHES } from './patches';

const {
  runDataSourceImport,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
  heartbeatTimeout: '2 minutes',
  retry: { maximumAttempts: 2, initialInterval: '10 seconds' },
});

const { failDataSourceRun } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  retry: { maximumAttempts: 5 },
});

export interface DataSourceSyncInput {
  dataSourceId: string;
  tenantId: string;
  triggerType: 'manual' | 'scheduled';
}

export async function dataSourceSync(input: DataSourceSyncInput): Promise<void> {
  try {
    await runDataSourceImport(input.dataSourceId, input.tenantId, input.triggerType);
  } catch (err) {
    if (patched(WORKFLOW_PATCHES.dataSourceFailOrphanRun)) {
      const { workflowId, runId } = workflowInfo();
      const cause = err instanceof Error && err.cause instanceof Error ? err.cause : err;
      const message = cause instanceof Error ? cause.message : String(cause);
      await failDataSourceRun(input.dataSourceId, input.tenantId, `${workflowId}/${runId}`, message);
    }
    throw err;
  }
}
