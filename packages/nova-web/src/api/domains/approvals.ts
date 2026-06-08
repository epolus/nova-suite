/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type { PendingApproval } from '../types';

export const approvals = {
  pendingCount: () => request<{ count: number }>('/approvals/pending-count'),
  list: () => request<{ approvals: PendingApproval[] }>('/approvals'),
};
