/* SPDX-License-Identifier: AGPL-3.0-only */
import { defineSignal, proxyActivities, setHandler, condition, workflowInfo } from '@temporalio/workflow';

import type * as activities from '../activities';

const { postmortemGetStatus, postmortemLogReminder, postmortemRecordWorkflowId } = proxyActivities<typeof activities>({
  startToCloseTimeout: '60 seconds',
  retry: { maximumAttempts: 5, initialInterval: '2 seconds' },
});

export type PostmortemWorkflowInput = {
  tenantId: string;
  postmortemId: string;
};

/** API can signal when postmortem is published to end reminders early. */
export const postmortemPublishedSignal = defineSignal('postmortemPublished');

/**
 * Reminds until postmortem is published (daily check).
 */
export async function postmortemWorkflow(input: PostmortemWorkflowInput): Promise<void> {
  let published = false;
  setHandler(postmortemPublishedSignal, () => {
    published = true;
  });

  await postmortemRecordWorkflowId(input.tenantId, input.postmortemId, workflowInfo().workflowId);

  while (!published) {
    const s = await postmortemGetStatus(input.tenantId, input.postmortemId);
    if (s.status === 'published') return;
    const due = s.dueAt ? new Date(s.dueAt).getTime() : null;
    const now = Date.now();
    if (due && now > due) {
      await postmortemLogReminder(input.tenantId, input.postmortemId, 'overdue');
    } else if (due && due - now < 24 * 60 * 60 * 1000) {
      await postmortemLogReminder(input.tenantId, input.postmortemId, 'due_soon');
    }
    const signaled = await condition(() => published, '24 hours');
    if (published || signaled) return;
    const again = await postmortemGetStatus(input.tenantId, input.postmortemId);
    if (again.status === 'published') return;
  }
}
