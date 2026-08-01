/* SPDX-License-Identifier: AGPL-3.0-only */
import type { useIncidentDetail } from './useIncidentDetail';

export type IncidentDetailState = ReturnType<typeof useIncidentDetail>;

/** Stable DOM ids/names for incident detail form controls. */
export const INCIDENT_FIELD = {
  assignmentGroupId: 'incident-assignment-group',
  assignedTo: 'incident-assigned-to',
  impact: 'incident-impact',
  urgency: 'incident-urgency',
  pendingReason: 'incident-pending-reason',
  callerId: 'incident-caller',
  contactInfo: 'incident-contact-info',
  serviceId: 'incident-service',
  configurationItemId: 'incident-configuration-item',
  category: 'incident-category',
  subcategory: 'incident-subcategory',
  relatedProblemId: 'incident-related-problem',
  title: 'incident-title',
  description: 'incident-description',
  resolutionNotes: 'incident-resolution-notes',
  journalContent: 'incident-journal-content',
  journalType: 'incident-journal-type',
  journalVisible: 'incident-journal-visible',
} as const;

export function getInputCls(readonly: boolean): string {
  return `w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none${readonly ? ' bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`;
}
