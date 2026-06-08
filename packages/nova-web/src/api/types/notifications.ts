/* SPDX-License-Identifier: AGPL-3.0-only */
export interface NotificationRule {
  id: string;
  external_key?: string | null;
  name: string;
  description: string | null;
  entity_type: 'incident' | 'request' | 'change' | 'problem' | 'knowledge' | 'major_incident';
  trigger_key: string;
  recipient_type:
    | 'caller'
    | 'assignee'
    | 'requester'
    | 'requested_for'
    | 'requested_by'
    | 'reported_by'
    | 'author'
    | 'assignment_group_manager'
    | 'specific_user'
    | 'assignment_group_members'
    | 'role_major_incident_manager'
    | 'role_fulfiller';
  recipient_user_id: string | null;
  recipient_user_name?: string | null;
  recipient_group_id: string | null;
  recipient_group_name?: string | null;
  channels: Array<'in_app' | 'email'>;
  templates?: NotificationRuleTemplate[];
  title_template: string;
  body_template: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface NotificationRuleTemplate {
  locale: string;
  title_template: string;
  body_template: string | null;
  body_html_template: string | null;
}

export interface NotificationEmailDelivery {
  id: string;
  notification_rule_id: string | null;
  notification_rule_name?: string | null;
  recipient_user_id: string | null;
  recipient_user_name?: string | null;
  recipient_email: string;
  recipient_locale: string;
  entity_type: string;
  entity_id: string;
  trigger_key: string;
  template_locale: string;
  subject: string;
  body_text: string | null;
  body_html: string | null;
  status: 'queued' | 'sent' | 'failed';
  provider: string;
  provider_message_id: string | null;
  retry_count: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationEmailDeliverySummary {
  status: 'queued' | 'sent' | 'failed';
  count: number;
}
