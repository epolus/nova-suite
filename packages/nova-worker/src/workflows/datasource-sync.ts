/* SPDX-License-Identifier: AGPL-3.0-only */
import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

const {
  runDataSourceImport,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
  retry: { maximumAttempts: 2, initialInterval: '10 seconds' },
});

export interface DataSourceSyncInput {
  dataSourceId: string;
  tenantId: string;
  triggerType: 'manual' | 'scheduled';
}

export async function dataSourceSync(input: DataSourceSyncInput): Promise<void> {
  await runDataSourceImport(input.dataSourceId, input.tenantId, input.triggerType);
}
