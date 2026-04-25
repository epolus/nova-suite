/* SPDX-License-Identifier: AGPL-3.0-only */
import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';
import type { NotificationDispatchInput } from '../activities/notification-activities';

const { dispatchConfiguredNotifications } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 3, initialInterval: '1 second' },
});

export async function notificationDispatch(input: NotificationDispatchInput): Promise<number> {
  return dispatchConfiguredNotifications(input);
}
