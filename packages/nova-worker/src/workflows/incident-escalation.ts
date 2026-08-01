/* SPDX-License-Identifier: AGPL-3.0-only */
import { proxyActivities, sleep, defineSignal, setHandler, condition } from '@temporalio/workflow';

import type * as activities from '../activities';

const {
  getIncident,
  markSlaBreached,
  escalateIncident,
  autoAssignIncident,
  sendNotification,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 3, initialInterval: '2 seconds' },
});

export interface EscalationInput {
  incidentId: string;
  tenantId: string;
  priority: number;
  slaDueAt: string;
}

// Signal to cancel escalation early (e.g. incident resolved manually)
export const resolvedSignal = defineSignal('incidentResolved');

/**
 * Incident SLA escalation workflow.
 *
 * 1. Waits until the SLA due time approaches (80% of remaining time).
 * 2. Checks if the incident is still open and unresolved.
 * 3. If still unassigned → auto-assigns to an incident management group.
 * 4. Sends a notification about impending SLA breach.
 * 5. Waits for the full SLA timer to expire.
 * 6. If still not resolved → marks SLA breached, escalates priority, notifies.
 *
 * Can be cancelled early via the `incidentResolved` signal.
 */
export async function incidentEscalation(input: EscalationInput): Promise<string> {
  let resolved = false;

  setHandler(resolvedSignal, () => {
    resolved = true;
  });

  const slaDue = new Date(input.slaDueAt).getTime();
  const now = Date.now();
  const totalMs = slaDue - now;

  if (totalMs <= 0) {
    // SLA already past due when workflow started
    await markSlaBreached(input.incidentId, input.tenantId);
    await sendNotification(
      input.incidentId,
      input.tenantId,
      `Incident was already past SLA when escalation workflow started`,
    );
    return 'breached_immediately';
  }

  // ── Phase 1: Wait until 80% of SLA time has elapsed (warning phase) ──
  const warningMs = Math.floor(totalMs * 0.8);
  const earlyResolved = await condition(() => resolved, warningMs);
  if (earlyResolved) return 'resolved_before_warning';

  // Check if incident is still open
  const incident = await getIncident(input.incidentId, input.tenantId);
  if (!incident || ['resolved', 'closed', 'cancelled'].includes(incident.status)) {
    return 'already_resolved';
  }

  // If unassigned, try auto-assignment
  if (!incident.assignedTo) {
    const assigned = await autoAssignIncident(input.incidentId, input.tenantId);
    if (assigned) {
      await sendNotification(
        input.incidentId,
        input.tenantId,
        `SLA warning: ${incident.number} auto-assigned. ${Math.round((totalMs - warningMs) / 60_000)} minutes remaining.`,
      );
    }
  }

  await sendNotification(
    input.incidentId,
    input.tenantId,
    `SLA warning: ${incident.number} "${incident.title}" has ${Math.round((totalMs - warningMs) / 60_000)} minutes until SLA breach.`,
  );

  // ── Phase 2: Wait for the remaining 20% until SLA breach ──
  const remainingMs = totalMs - warningMs;
  const resolvedInTime = await condition(() => resolved, remainingMs);
  if (resolvedInTime) return 'resolved_before_breach';

  // Check once more before marking breach
  const finalCheck = await getIncident(input.incidentId, input.tenantId);
  if (!finalCheck || ['resolved', 'closed', 'cancelled'].includes(finalCheck.status)) {
    return 'resolved_at_last_moment';
  }

  // ── Phase 3: SLA breached — escalate ──
  await markSlaBreached(input.incidentId, input.tenantId);

  // Escalate priority by 1 level (minimum P1)
  const newPriority = Math.max(1, finalCheck.priority - 1);
  if (newPriority < finalCheck.priority) {
    await escalateIncident(input.incidentId, input.tenantId, newPriority);
  }

  await sendNotification(
    input.incidentId,
    input.tenantId,
    `SLA BREACHED: ${finalCheck.number} "${finalCheck.title}" has breached its SLA. Priority escalated to P${newPriority}.`,
  );

  // ── Phase 4: Post-breach follow-up (check again after 30 min) ──
  await sleep('30 minutes');

  const postBreachCheck = await getIncident(input.incidentId, input.tenantId);
  if (postBreachCheck && !['resolved', 'closed', 'cancelled'].includes(postBreachCheck.status)) {
    await sendNotification(
      input.incidentId,
      input.tenantId,
      `URGENT: ${postBreachCheck.number} remains unresolved 30 minutes after SLA breach.`,
    );
  }

  return 'breached';
}
