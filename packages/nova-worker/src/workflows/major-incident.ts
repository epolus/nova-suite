/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  CancellationScope,
  condition,
  defineQuery,
  defineSignal,
  isCancellation,
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  sleep,
  startChild,
  workflowInfo,
} from '@temporalio/workflow';

import type * as activities from '../activities';
import { postmortemWorkflow } from './postmortem';

const {
  majorIncidentOnDeclared,
  majorIncidentGetSnapshot,
  majorIncidentNudgeNoCommander,
  majorIncidentMaybeNudgeStakeholderComms,
  majorIncidentSetMonitoring,
  majorIncidentFinalizeResolved,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '60 seconds',
  retry: { maximumAttempts: 5, initialInterval: '2 seconds' },
});

export type MajorIncidentWorkflowInput = {
  majorIncidentId: string;
  tenantId: string;
  title: string;
};

export type MajorIncidentPhase = 'active' | 'monitoring' | 'done';

/** Fired when API / commander requests resolution (starts monitoring window in workflow). */
export const declareResolvedSignal = defineSignal('declareResolved');

/** Optional: reset stakeholder cadence tracking when an update is posted via API. */
export const stakeholderUpdateSignal = defineSignal('stakeholderUpdatePosted');

export const assignRoleSignal = defineSignal('assignRole');

export const getMajorIncidentStatusQuery = defineQuery<{ phase: MajorIncidentPhase; majorIncidentId: string }>(
  'getMajorIncidentStatus',
);

/**
 * Major incident lifecycle: comms cadence nudges, commander nudge, monitoring window, postmortem child.
 */
export async function majorIncidentWorkflow(input: MajorIncidentWorkflowInput): Promise<void> {
  let phase: MajorIncidentPhase = 'active';

  setHandler(declareResolvedSignal, () => {
    if (phase === 'active') phase = 'monitoring';
  });

  setHandler(stakeholderUpdateSignal, () => {
    /* no-op: cadence uses DB timestamps from stakeholder_updates */
  });

  setHandler(assignRoleSignal, () => {
    /* reserved for future workflow-side state */
  });

  setHandler(getMajorIncidentStatusQuery, () => ({
    phase,
    majorIncidentId: input.majorIncidentId,
  }));

  await majorIncidentOnDeclared(input.tenantId, input.majorIncidentId, input.title, workflowInfo().workflowId);

  const scope = new CancellationScope();
  const background = scope.run(async () => {
    const commanderBranch = (async () => {
      await sleep('10 minutes');
      if (phase !== 'active') return;
      const snap = await majorIncidentGetSnapshot(input.tenantId, input.majorIncidentId);
      if (!snap.hasCommander) {
        await majorIncidentNudgeNoCommander(input.tenantId, input.majorIncidentId);
      }
    })();

    const commsBranch = (async () => {
      while (phase === 'active') {
        await sleep('30 minutes');
        if (phase !== 'active') break;
        await majorIncidentMaybeNudgeStakeholderComms(input.tenantId, input.majorIncidentId);
      }
    })();

    await Promise.all([commanderBranch, commsBranch]);
  });

  await condition(() => phase !== 'active');
  scope.cancel();
  try {
    await background;
  } catch (err) {
    if (!isCancellation(err)) throw err;
  }

  if (phase !== 'active') {
    await majorIncidentSetMonitoring(input.tenantId, input.majorIncidentId);
    await sleep('5 minutes');
    const { postmortemId } = await majorIncidentFinalizeResolved(input.tenantId, input.majorIncidentId);
    await startChild(postmortemWorkflow, {
      args: [{ tenantId: input.tenantId, postmortemId }],
      workflowId: `postmortem-${postmortemId}`,
      parentClosePolicy: ParentClosePolicy.ABANDON,
    });
  }

  phase = 'done';
}
