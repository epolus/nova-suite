/* SPDX-License-Identifier: AGPL-3.0-only */
import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

const {
  purgeAuditEventsForAllTenants,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '45 minutes',
  heartbeatTimeout: '5 minutes',
  retry: { maximumAttempts: 3, initialInterval: '30 seconds' },
});

export async function auditEventsRetention(): Promise<{
  tenants: number;
  deleted: number;
  skipped: boolean;
}> {
  return purgeAuditEventsForAllTenants();
}
