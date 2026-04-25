/* SPDX-License-Identifier: AGPL-3.0-only */
import { proxyActivities, sleep } from '@temporalio/workflow';
import type * as activities from '../activities';

const {
  getIncident,
  autoCloseIncident,
  sendNotification,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 3, initialInterval: '2 seconds' },
});

export interface IncidentAutoCloseInput {
  incidentId: string;
  tenantId: string;
  autoCloseAfterDays?: number;
}

/**
 * Auto-closes incidents that remain in "resolved" for N days (default: 7).
 * If incident is reopened/closed/cancelled before timer expires, no action is taken.
 */
export async function incidentAutoClose(input: IncidentAutoCloseInput): Promise<string> {
  const autoCloseAfterDays = input.autoCloseAfterDays ?? 7;
  await sleep(`${autoCloseAfterDays} days`);

  const incident = await getIncident(input.incidentId, input.tenantId);
  if (!incident) return 'not_found';
  if (incident.status !== 'resolved') return `skipped_${incident.status}`;

  const closed = await autoCloseIncident(input.incidentId, input.tenantId);
  if (!closed) return 'already_changed';

  await sendNotification(
    input.incidentId,
    input.tenantId,
    `Incident ${incident.number} was automatically closed after ${autoCloseAfterDays} days in resolved status.`,
  );
  return 'closed';
}
