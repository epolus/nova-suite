/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Incident } from '../../api/client';

export const SIDEBAR_STORAGE_KEY = 'incident_detail_intelligence_sidebar_open';

export const EMPTY_FIELDS = {
  impact: '',
  urgency: '',
  status: '',
  pendingReason: '',
  assignmentGroupId: '',
  assignedTo: '',
  callerId: '',
  contactInfo: '',
  serviceId: '',
  configurationItemId: '',
  title: '',
  description: '',
  category: '',
  subcategory: '',
  resolutionNotes: '',
  relatedProblemId: '',
};

export type IncidentFields = typeof EMPTY_FIELDS;

export function buildFieldsFromIncident(i: Incident): IncidentFields {
  return {
    impact: i.impact,
    urgency: i.urgency,
    status: i.status,
    pendingReason: i.resolution_code || '',
    assignmentGroupId: i.assignment_group_id || '',
    assignedTo: i.assigned_to || '',
    callerId: i.caller_id || '',
    contactInfo: i.contact_info || '',
    serviceId: i.service_id || '',
    configurationItemId: i.configuration_item_id || '',
    title: i.title,
    description: i.description || '',
    category: i.category || '',
    subcategory: i.subcategory || '',
    resolutionNotes: i.resolution_notes || '',
    relatedProblemId: '',
  };
}

export function buildIncidentUpdates(fields: IncidentFields, inc: Incident): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  if (fields.impact !== inc.impact) updates.impact = fields.impact;
  if (fields.urgency !== inc.urgency) updates.urgency = fields.urgency;
  if (fields.status !== inc.status) updates.status = fields.status;
  if (fields.title !== inc.title) updates.title = fields.title;
  if (fields.description !== (inc.description || '')) updates.description = fields.description || null;
  if (fields.category !== (inc.category || '')) updates.category = fields.category || null;
  if (fields.subcategory !== (inc.subcategory || '')) updates.subcategory = fields.subcategory || null;
  if (fields.contactInfo !== (inc.contact_info || '')) updates.contact_info = fields.contactInfo || null;
  if (fields.pendingReason !== (inc.resolution_code || '')) updates.resolution_code = fields.pendingReason || null;

  const newAgId = fields.assignmentGroupId || null;
  if (newAgId !== (inc.assignment_group_id || null)) updates.assignment_group_id = newAgId;

  const newAssignedTo = fields.assignedTo || null;
  if (newAssignedTo !== (inc.assigned_to || null)) updates.assigned_to = newAssignedTo;

  const newCallerId = fields.callerId || null;
  if (newCallerId !== (inc.caller_id || null)) updates.caller_id = newCallerId;

  const newServiceId = fields.serviceId || null;
  if (newServiceId !== (inc.service_id || null)) updates.service_id = newServiceId;

  const newCiId = fields.configurationItemId || null;
  if (newCiId !== (inc.configuration_item_id || null)) updates.configuration_item_id = newCiId;

  if (
    (fields.status === 'resolved' || inc.status === 'resolved') &&
    fields.resolutionNotes !== (inc.resolution_notes || '')
  ) {
    updates.resolution_notes = fields.resolutionNotes || null;
  }

  return updates;
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
