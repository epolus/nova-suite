/* SPDX-License-Identifier: AGPL-3.0-only */
import { proxyActivities, sleep, defineSignal, setHandler, condition } from '@temporalio/workflow';

import type * as activities from '../activities';
import { warningAtMs } from './sla-warning';

const {
  getIncident,
  markSlaBreached,
  markResponseBreached,
  escalateIncident,
  autoAssignIncident,
  sendNotification,
  applySlaActions,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 3, initialInterval: '2 seconds' },
});

export interface EscalationInput {
  incidentId: string;
  tenantId: string;
  priority: number;
  slaDueAt: string;
  responseDueAt?: string | null;
}

// Signal to cancel escalation early (e.g. incident resolved manually)
export const resolvedSignal = defineSignal('incidentResolved');

const TERMINAL = new Set(['resolved', 'closed', 'cancelled']);
const PAUSE_POLL_MS = 60_000;

type TimerKind = 'response' | 'resolution';

/**
 * Incident SLA escalation workflow — dual timers (response + resolution).
 *
 * Tracks both response_due_at and sla_due_at (resolution). Warns at the
 * definition's warning_pct (default 80%). Marks response_breached / sla_breached
 * separately. A set responded_at stops the response timer.
 * While sla_paused_at is set, the workflow polls and does not fire breach.
 */
export async function incidentEscalation(input: EscalationInput): Promise<string> {
  let resolved = false;

  setHandler(resolvedSignal, () => {
    resolved = true;
  });

  let responseWarned = false;
  let responseBreached = false;
  let resolutionWarned = false;
  let resolutionBreached = false;
  const startedAt = Date.now();

  const responseTotalMs = input.responseDueAt
    ? Math.max(0, new Date(input.responseDueAt).getTime() - startedAt)
    : 0;
  const resolutionTotalMs = input.slaDueAt
    ? Math.max(0, new Date(input.slaDueAt).getTime() - startedAt)
    : 0;

  while (!resolved) {
    const incident = await getIncident(input.incidentId, input.tenantId);
    if (!incident || TERMINAL.has(incident.status)) {
      return responseBreached || resolutionBreached ? 'breached_then_resolved' : 'already_resolved';
    }

    if (incident.responseBreached) responseBreached = true;
    if (incident.slaBreached) resolutionBreached = true;

    // While paused, wait and re-check (due dates are extended on resume).
    if (incident.slaPausedAt) {
      const pausedOut = await condition(() => resolved, PAUSE_POLL_MS);
      if (pausedOut) return 'resolved_while_paused';
      continue;
    }

    const now = Date.now();
    const responseDueMs = incident.responseDueAt
      ? new Date(incident.responseDueAt).getTime()
      : null;
    const resolutionDueMs = incident.slaDueAt
      ? new Date(incident.slaDueAt).getTime()
      : null;

    const nextEvents: Array<{ at: number; kind: TimerKind; phase: 'warn' | 'breach' }> = [];

    const responseSatisfied = Boolean(incident.respondedAt);
    if (responseDueMs != null && !responseBreached && !responseSatisfied) {
      const warnAt = warningAtMs(
        responseDueMs,
        responseTotalMs || (responseDueMs - startedAt),
        startedAt,
        incident.warningPct ?? 80,
      );
      if (!responseWarned && warnAt > now) {
        nextEvents.push({ at: warnAt, kind: 'response', phase: 'warn' });
      } else if (!responseWarned && now >= warnAt && now < responseDueMs) {
        await handleWarning(input, incident, 'response');
        responseWarned = true;
      }
      if (now >= responseDueMs) {
        await handleBreach(input, incident, 'response');
        responseBreached = true;
      } else {
        nextEvents.push({ at: responseDueMs, kind: 'response', phase: 'breach' });
      }
    }

    if (resolutionDueMs != null && !resolutionBreached) {
      const warnAt = warningAtMs(
        resolutionDueMs,
        resolutionTotalMs || (resolutionDueMs - startedAt),
        startedAt,
        incident.warningPct ?? 80,
      );
      if (!resolutionWarned && warnAt > now) {
        nextEvents.push({ at: warnAt, kind: 'resolution', phase: 'warn' });
      } else if (!resolutionWarned && now >= warnAt && now < resolutionDueMs) {
        await handleWarning(input, incident, 'resolution');
        resolutionWarned = true;
      }
      if (now >= resolutionDueMs) {
        await handleBreach(input, incident, 'resolution');
        resolutionBreached = true;
      } else {
        nextEvents.push({ at: resolutionDueMs, kind: 'resolution', phase: 'breach' });
      }
    }

    if (responseBreached && resolutionBreached) break;
    if (nextEvents.length === 0) {
      // Nothing left to wait for (missing due dates or already handled).
      break;
    }

    nextEvents.sort((a, b) => a.at - b.at);
    const next = nextEvents[0]!;
    const waitMs = Math.max(0, next.at - Date.now());
    const early = await condition(() => resolved, waitMs);
    if (early) return 'resolved_before_breach';

    // Loop will re-fetch and apply the due event.
  }

  if (resolved) return 'resolved_before_breach';

  // Post-breach follow-up when resolution breached
  if (resolutionBreached) {
    await sleep('30 minutes');
    const postBreachCheck = await getIncident(input.incidentId, input.tenantId);
    if (postBreachCheck && !TERMINAL.has(postBreachCheck.status)) {
      await sendNotification(
        input.incidentId,
        input.tenantId,
        `URGENT: ${postBreachCheck.number} remains unresolved 30 minutes after resolution SLA breach.`,
      );
    }
    return 'breached';
  }

  if (responseBreached) return 'response_breached';
  return 'completed';
}

async function handleWarning(
  input: EscalationInput,
  incident: NonNullable<Awaited<ReturnType<typeof getIncident>>>,
  kind: TimerKind,
): Promise<void> {
  const label = kind === 'response' ? 'Response' : 'Resolution';
  const message = `${label} SLA warning: ${incident.number} "${incident.title}" is approaching its ${kind} due time.`;

  if (incident.slaDefinitionId) {
    await applySlaActions(input.incidentId, input.tenantId, incident.onWarning, message, 'warn');
    return;
  }

  if (kind === 'resolution' && !incident.assignedTo) {
    const assigned = await autoAssignIncident(input.incidentId, input.tenantId);
    if (assigned) {
      await sendNotification(
        input.incidentId,
        input.tenantId,
        `Resolution SLA warning: ${incident.number} auto-assigned.`,
      );
    }
  }

  await sendNotification(input.incidentId, input.tenantId, message);
}

async function handleBreach(
  input: EscalationInput,
  incident: NonNullable<Awaited<ReturnType<typeof getIncident>>>,
  kind: TimerKind,
): Promise<void> {
  if (kind === 'response') {
    if (!incident.responseBreached) {
      await markResponseBreached(input.incidentId, input.tenantId);
    }
    const message = `Response SLA BREACHED: ${incident.number} "${incident.title}".`;
    if (incident.slaDefinitionId) {
      await applyConfiguredBreach(input, incident, message);
      return;
    }
    await sendNotification(input.incidentId, input.tenantId, message);
    return;
  }

  if (!incident.slaBreached) {
    await markSlaBreached(input.incidentId, input.tenantId);
  }

  const message = `Resolution SLA BREACHED: ${incident.number} "${incident.title}".`;
  if (incident.slaDefinitionId) {
    await applyConfiguredBreach(input, incident, message);
    return;
  }

  const fresh = await getIncident(input.incidentId, input.tenantId);
  const priority = fresh?.priority ?? incident.priority;
  const escalatedTo = Math.max(1, priority - 1);
  if (escalatedTo < priority) {
    await escalateIncident(input.incidentId, input.tenantId, escalatedTo);
  }
  await sendNotification(
    input.incidentId,
    input.tenantId,
    `${message} Priority escalated to P${escalatedTo}.`,
  );
}

async function applyConfiguredBreach(
  input: EscalationInput,
  incident: NonNullable<Awaited<ReturnType<typeof getIncident>>>,
  message: string,
): Promise<void> {
  const actions = incident.onBreach;
  let text = message;
  if (actions.includes('escalate_priority')) {
    const fresh = await getIncident(input.incidentId, input.tenantId);
    const priority = fresh?.priority ?? incident.priority;
    const escalatedTo = Math.max(1, priority - 1);
    if (escalatedTo < priority) {
      await escalateIncident(input.incidentId, input.tenantId, escalatedTo);
      text = `${message} Priority escalated to P${escalatedTo}.`;
    }
  }
  await applySlaActions(input.incidentId, input.tenantId, actions, text, 'breach');
}
