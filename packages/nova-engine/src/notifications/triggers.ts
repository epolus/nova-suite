/* SPDX-License-Identifier: AGPL-3.0-only */
export const NOTIFICATION_TRIGGER_KEYS = {
  incident: [
    'incident.created',
    'incident.assigned',
    'incident.resolved',
    'incident.commented',
  ],
  request: [
    'request.created',
    'request.approved',
    'request.rejected',
    'request.fulfilled',
    'request.cancelled',
  ],
  change: [
    'change.created',
    'change.pending_approval',
    'change.approved',
    'change.rejected',
    'change.scheduled',
  ],
  problem: [
    'problem.created',
    'problem.assigned',
    'problem.resolved',
  ],
  knowledge: [
    'knowledge.submitted_for_review',
    'knowledge.published',
    'knowledge.rejected',
  ],
  major_incident: [
    'major_incident.promotion_requested',
    'major_incident.accepted',
    'major_incident.resolve_requested',
    'major_incident.stakeholder_update',
    'major_incident.declared',
  ],
} as const;

export function getRequestApprovalTrigger(
  outcome: 'approve' | 'reject' | 'approved' | 'rejected',
): 'request.approved' | 'request.rejected' {
  return outcome === 'approve' || outcome === 'approved'
    ? 'request.approved'
    : 'request.rejected';
}

