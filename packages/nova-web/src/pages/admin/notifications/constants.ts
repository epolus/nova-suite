/* SPDX-License-Identifier: AGPL-3.0-only */
import type { NotificationRule, NotificationRuleTemplate } from '../../../api/client';

export const TRIGGER_DEFS = [
  { entity: 'incident', id: 'incident.created' },
  { entity: 'incident', id: 'incident.assigned' },
  { entity: 'incident', id: 'incident.resolved' },
  { entity: 'incident', id: 'incident.commented' },
  { entity: 'request', id: 'request.created' },
  { entity: 'request', id: 'request.approved' },
  { entity: 'request', id: 'request.rejected' },
  { entity: 'request', id: 'request.fulfilled' },
  { entity: 'request', id: 'request.cancelled' },
  { entity: 'change', id: 'change.created' },
  { entity: 'change', id: 'change.pending_approval' },
  { entity: 'change', id: 'change.approved' },
  { entity: 'change', id: 'change.rejected' },
  { entity: 'change', id: 'change.scheduled' },
  { entity: 'problem', id: 'problem.created' },
  { entity: 'problem', id: 'problem.assigned' },
  { entity: 'problem', id: 'problem.resolved' },
  { entity: 'knowledge', id: 'knowledge.submitted_for_review' },
  { entity: 'knowledge', id: 'knowledge.published' },
  { entity: 'knowledge', id: 'knowledge.rejected' },
  { entity: 'major_incident', id: 'major_incident.promotion_requested' },
  { entity: 'major_incident', id: 'major_incident.accepted' },
  { entity: 'major_incident', id: 'major_incident.resolve_requested' },
  { entity: 'major_incident', id: 'major_incident.stakeholder_update' },
  { entity: 'major_incident', id: 'major_incident.declared' },
] as const;

export const RECIPIENT_IDS = [
  'caller',
  'assignee',
  'requester',
  'requested_for',
  'requested_by',
  'reported_by',
  'author',
  'assignment_group_manager',
  'specific_user',
  'assignment_group_members',
  'role_major_incident_manager',
  'role_fulfiller',
] as const;

export const ENTITY_OPTIONS: NotificationRule['entity_type'][] = [
  'incident',
  'request',
  'change',
  'problem',
  'knowledge',
  'major_incident',
];

export const TEMPLATE_LOCALES = ['en', 'de', 'de-ch', 'fr', 'it'] as const;
export type TemplateLocale = typeof TEMPLATE_LOCALES[number];

export type NotificationRuleForm = {
  id?: string;
  name: string;
  description: string;
  entity_type: NotificationRule['entity_type'];
  trigger_key: string;
  recipient_type: NotificationRule['recipient_type'];
  recipient_user_id: string | null;
  recipient_group_id: string | null;
  channels: Array<'in_app' | 'email'>;
  templates: NotificationRuleTemplate[];
  sort_order: number;
};

export function getTemplatesFromRule(rule: NotificationRule): NotificationRuleTemplate[] {
  if (Array.isArray(rule.templates) && rule.templates.length > 0) {
    return rule.templates.map((template) => ({
      locale: template.locale,
      title_template: template.title_template,
      body_template: template.body_template,
      body_html_template: template.body_html_template ?? null,
    }));
  }
  return [{
    locale: 'en',
    title_template: rule.title_template,
    body_template: rule.body_template,
    body_html_template: null,
  }];
}
