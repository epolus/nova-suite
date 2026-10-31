/* SPDX-License-Identifier: AGPL-3.0-only */
import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

const { extractServiceNowMigrationSnapshot } = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 hours',
  heartbeatTimeout: '5 minutes',
  retry: { maximumAttempts: 3, initialInterval: '30 seconds', backoffCoefficient: 2 },
});

const { transformServiceNowMigrationSnapshot, failServiceNowMigration } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: { maximumAttempts: 2, initialInterval: '10 seconds' },
});

export interface ServiceNowMigrationWorkflowInput {
  runId: string;
  tenantId: string;
}

function failureMessage(err: unknown): string {
  let cur: unknown = err;
  // Activity failures wrap the original ApplicationFailure in `cause`.
  while (cur && typeof cur === 'object' && 'cause' in cur && (cur as { cause?: unknown }).cause) {
    cur = (cur as { cause: unknown }).cause;
  }
  if (cur instanceof ApplicationFailure || cur instanceof Error) return cur.message;
  return 'Migration failed';
}

/** Read-only extract + transform; applying the package is a separate admin action. */
export async function serviceNowCatalogMigration(input: ServiceNowMigrationWorkflowInput): Promise<void> {
  try {
    await extractServiceNowMigrationSnapshot(input);
    await transformServiceNowMigrationSnapshot(input);
  } catch (err) {
    await failServiceNowMigration({ ...input, error: failureMessage(err) });
    throw err;
  }
}
