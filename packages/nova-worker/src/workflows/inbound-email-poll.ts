/* SPDX-License-Identifier: AGPL-3.0-only */
import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

const { pollInboundEmailMailboxes } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: { maximumAttempts: 2, initialInterval: '15 seconds' },
});

export async function inboundEmailPoll(): Promise<{
  tenants: number;
  mailboxes: number;
  fetched: number;
  errors: number;
}> {
  return pollInboundEmailMailboxes();
}
