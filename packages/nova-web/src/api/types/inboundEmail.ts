/* SPDX-License-Identifier: AGPL-3.0-only */

export type InboundEmailAction = 'create_incident' | 'update_incident' | 'ignore';
export type InboundJournalEntryType = 'comment' | 'work_note';

export interface MailboxItem {
  id: string;
  name: string;
  address: string;
  credential_slug: string;
  protocol: string;
  config: Record<string, unknown>;
  assignment_group_id: string | null;
  default_service_id: string | null;
  poll_interval_seconds: number;
  last_polled_at: string | null;
  last_uid: string | number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InboundEmailRule {
  id: string;
  mailbox_id: string | null;
  name: string;
  sort_order: number;
  is_active: boolean;
  stop_on_match: boolean;
  match_from_contains: string | null;
  match_from_regex: string | null;
  match_subject_contains: string | null;
  match_subject_regex: string | null;
  match_body_contains: string | null;
  match_has_ticket_ref: boolean;
  match_in_reply_to_known: boolean;
  action: InboundEmailAction;
  require_open_incident: boolean;
  journal_entry_type: InboundJournalEntryType;
  created_at: string;
  updated_at: string;
}

export interface EmailMessageItem {
  id: string;
  message_id: string | null;
  from_address: string;
  to_addresses: string;
  subject: string;
  processing_status: string;
  processing_notes: string | null;
  incident_id: string | null;
  matched_rule_id: string | null;
  processed_at: string | null;
  created_at: string;
}

export type MailboxPayload = {
  name: string;
  address: string;
  credential_slug: string;
  config?: Record<string, unknown>;
  assignment_group_id?: string | null;
  default_service_id?: string | null;
  poll_interval_seconds?: number;
  is_active?: boolean;
};

export type InboundEmailRulePayload = {
  name: string;
  mailbox_id?: string | null;
  sort_order?: number;
  is_active?: boolean;
  stop_on_match?: boolean;
  match_from_contains?: string | null;
  match_from_regex?: string | null;
  match_subject_contains?: string | null;
  match_subject_regex?: string | null;
  match_body_contains?: string | null;
  match_has_ticket_ref?: boolean;
  match_in_reply_to_known?: boolean;
  action: InboundEmailAction;
  require_open_incident?: boolean;
  journal_entry_type?: InboundJournalEntryType;
};
