/* SPDX-License-Identifier: AGPL-3.0-only */
import { proxyActivities, defineSignal, setHandler, condition } from '@temporalio/workflow';
import type * as activities from '../activities';

const {
  getTaskDefinitions,
  createRequestTasks,
  activateTaskGroup,
  completeRequestTask,
  skipRemainingTasks,
  updateRequestStatus,
  getPendingTaskCount,
  getAwaitingHumanTaskIds,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 3, initialInterval: '2 seconds' },
});

const { executeAutomatedCatalogTask, skipRequestTasksByOrders } = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
  retry: { maximumAttempts: 2, initialInterval: '5 seconds' },
});

export interface FulfillmentInput {
  requestId: string;
  tenantId: string;
  serviceItemId: string;
}

export interface TaskCompletionSignal {
  taskId: string;
  outcome: 'approved' | 'rejected' | 'completed' | 'skipped' | 'cancelled';
  notes: string | null;
  userId: string;
}

export const taskCompletedSignal = defineSignal<[TaskCompletionSignal]>('taskCompleted');

/**
 * Catalog fulfillment workflow.
 *
 * Executes the task definitions for a service item in order.
 * Tasks with the same task_order run in parallel.
 * Approval rejections reject the request. Skipping a task continues fulfillment.
 * Cancelling a task cancels the request and skips whatever is still open.
 */
export async function catalogFulfillment(input: FulfillmentInput): Promise<string> {
  const completedTasks = new Map<string, TaskCompletionSignal>();
  let cancelRequested = false;

  setHandler(taskCompletedSignal, (signal: TaskCompletionSignal) => {
    completedTasks.set(signal.taskId, signal);
    if (signal.outcome === 'cancelled') cancelRequested = true;
  });

  const finishCancellation = async () => {
    const signal = Array.from(completedTasks.values()).find((entry) => entry.outcome === 'cancelled');
    if (signal) {
      await completeRequestTask(signal.taskId, input.tenantId, 'cancelled', null, signal.userId, signal.notes);
    }
    await skipRemainingTasks(input.requestId, input.tenantId);
    await updateRequestStatus(input.requestId, input.tenantId, 'cancelled');
  };

  // Load task definitions
  const taskDefs = await getTaskDefinitions(input.serviceItemId, input.tenantId);

  if (taskDefs.length === 0) {
    await updateRequestStatus(input.requestId, input.tenantId, 'in_progress');
    return 'no_tasks';
  }

  // Create all request_task records
  const createdTasks = await createRequestTasks(input.requestId, input.tenantId, taskDefs);

  // Initial request status depends on whether the first active gate is approval.
  const hasApprovalGate = createdTasks.some((t) => t.taskType === 'approval' && t.requiresUserCompletion);
  await updateRequestStatus(input.requestId, input.tenantId, hasApprovalGate ? 'pending_approval' : 'in_progress');

  // Group tasks by order
  const orderGroups = new Map<number, { id: string; taskType: string; requiresUserCompletion: boolean }[]>();
  for (const task of createdTasks) {
    const group = orderGroups.get(task.taskOrder) || [];
    group.push(task);
    orderGroups.set(task.taskOrder, group);
  }

  const sortedOrders = Array.from(orderGroups.keys()).sort((a, b) => a - b);

  // Process each group sequentially
  for (const order of sortedOrders) {
    const group = orderGroups.get(order)!;
    const groupHasApprovalGate = group.some((t) => t.taskType === 'approval' && t.requiresUserCompletion);

    // Activate this group
    await activateTaskGroup(input.requestId, input.tenantId, order);
    await updateRequestStatus(
      input.requestId,
      input.tenantId,
      groupHasApprovalGate ? 'pending_approval' : 'in_progress',
    );

    const automatedInGroup = group.filter((t) => !t.requiresUserCompletion && t.taskType === 'automated');
    if (automatedInGroup.length > 0) {
      const runAutomated = async (requestTaskId: string) => {
        let result = await executeAutomatedCatalogTask({
          requestTaskId,
          requestId: input.requestId,
          tenantId: input.tenantId,
        });
        // In-flow approvals and manual tasks pause the automation until the child task is completed.
        while (result.suspended) {
          if (cancelRequested) return { ok: true, skipTaskOrders: [] };
          const childTaskId = result.suspended.approvalTaskId;
          const isManual = result.suspended.taskKind === 'manual';
          if (!isManual) await updateRequestStatus(input.requestId, input.tenantId, 'pending_approval');
          await condition(() => completedTasks.has(childTaskId) || cancelRequested);
          if (cancelRequested && !completedTasks.has(childTaskId)) return { ok: true, skipTaskOrders: [] };
          const signal = completedTasks.get(childTaskId)!;
          if (signal.outcome === 'cancelled') return { ok: true, skipTaskOrders: [] };
          if (isManual && signal.outcome === 'skipped') {
            await completeRequestTask(childTaskId, input.tenantId, 'skipped', null, signal.userId, signal.notes);
            await updateRequestStatus(input.requestId, input.tenantId, 'in_progress');
            result = await executeAutomatedCatalogTask({
              requestTaskId,
              requestId: input.requestId,
              tenantId: input.tenantId,
              resumeOutcome: 'completed',
            });
            continue;
          }
          const outcome = isManual ? 'completed' : signal.outcome === 'rejected' ? 'rejected' : 'approved';
          await completeRequestTask(
            childTaskId,
            input.tenantId,
            outcome === 'rejected' ? 'rejected' : 'completed',
            isManual ? null : outcome,
            signal.userId,
            signal.notes,
          );
          await updateRequestStatus(input.requestId, input.tenantId, 'in_progress');
          result = await executeAutomatedCatalogTask({
            requestTaskId,
            requestId: input.requestId,
            tenantId: input.tenantId,
            resumeOutcome: outcome,
          });
        }
        return result;
      };
      const autoResults = await Promise.all(automatedInGroup.map((t) => runAutomated(t.id)));
      if (cancelRequested) {
        await finishCancellation();
        return 'cancelled';
      }
      if (autoResults.some((r) => !r.ok && r.rejectRequest)) {
        await skipRemainingTasks(input.requestId, input.tenantId);
        await updateRequestStatus(input.requestId, input.tenantId, 'rejected');
        return 'rejected';
      }
      const skipOrders = new Set<number>();
      for (const r of autoResults) {
        for (const o of r.skipTaskOrders ?? []) skipOrders.add(o);
      }
      if (skipOrders.size > 0) {
        await skipRequestTasksByOrders(
          input.requestId,
          input.tenantId,
          Array.from(skipOrders).sort((a, b) => a - b),
        );
      }
    }

    // Wait for tasks that are still pending/in_progress in DB (reflects automation + skipTaskOrders)
    const taskIds = new Set(
      await getAwaitingHumanTaskIds(input.requestId, input.tenantId, order),
    );

    // Wait for all tasks in the group that need user action (e.g. auto-skipped manager approval is excluded)
    const groupDone = () => Array.from(taskIds).every((id) => completedTasks.has(id));
    while (taskIds.size > 0 && !cancelRequested && !groupDone()) {
      await condition(() => groupDone() || cancelRequested, '30 days');
    }
    if (cancelRequested) {
      await finishCancellation();
      return 'cancelled';
    }

    // Process the completions for this group (skip tasks branch-skipped or already finalized without a signal)
    for (const task of group) {
      if (!task.requiresUserCompletion) {
        continue;
      }
      const signal = completedTasks.get(task.id);
      if (!signal) {
        continue;
      }

      if (task.taskType === 'approval' && signal.outcome === 'rejected') {
        // Rejection — complete this task, skip the rest, reject the request
        await completeRequestTask(task.id, input.tenantId, 'rejected', 'rejected', signal.userId, signal.notes);
        await skipRemainingTasks(input.requestId, input.tenantId);
        await updateRequestStatus(input.requestId, input.tenantId, 'rejected');
        return 'rejected';
      }

      const status = signal.outcome === 'skipped' ? 'skipped' : 'completed';
      const outcome = task.taskType === 'approval' ? signal.outcome : null;
      await completeRequestTask(task.id, input.tenantId, status, outcome, signal.userId, signal.notes);
    }

    // Verify all tasks in the group are actually done in the DB
    const pending = await getPendingTaskCount(input.requestId, input.tenantId, order);
    if (pending > 0) {
      // Shouldn't happen, but safety check
      await condition(() => false, '1 minute');
    }
  }

  // All groups completed — mark request as fulfilled
  await updateRequestStatus(input.requestId, input.tenantId, 'fulfilled');
  return 'fulfilled';
}
