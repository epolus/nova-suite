/* SPDX-License-Identifier: AGPL-3.0-only */
import type {
  InboundEmailAction,
  InboundEmailRule,
  InboundJournalEntryType,
  MailboxItem,
} from '@/api/client';

export type MailboxForm = {
  name: string;
  address: string;
  credential_slug: string;
  host: string;
  port: string;
  folder: string;
  assignment_group_id: string;
  poll_interval_seconds: string;
  is_active: boolean;
};

export type RuleForm = {
  name: string;
  mailbox_id: string;
  sort_order: string;
  stop_on_match: boolean;
  is_active: boolean;
  match_from_contains: string;
  match_subject_contains: string;
  match_body_contains: string;
  match_has_ticket_ref: boolean;
  match_in_reply_to_known: boolean;
  action: InboundEmailAction;
  require_open_incident: boolean;
  journal_entry_type: InboundJournalEntryType;
};

export const emptyMailbox: MailboxForm = {
  name: '',
  address: '',
  credential_slug: '',
  host: '',
  port: '993',
  folder: 'INBOX',
  assignment_group_id: '',
  poll_interval_seconds: '60',
  is_active: true,
};

export const emptyRule: RuleForm = {
  name: '',
  mailbox_id: '',
  sort_order: '100',
  stop_on_match: true,
  is_active: true,
  match_from_contains: '',
  match_subject_contains: '',
  match_body_contains: '',
  match_has_ticket_ref: false,
  match_in_reply_to_known: false,
  action: 'update_incident',
  require_open_incident: true,
  journal_entry_type: 'comment',
};

export function mailboxToForm(item: MailboxItem): MailboxForm {
  const cfg = item.config && typeof item.config === 'object' ? item.config : {};
  return {
    name: item.name,
    address: item.address,
    credential_slug: item.credential_slug,
    host: String(cfg.host || cfg.imap_host || ''),
    port: String(cfg.port || cfg.imap_port || 993),
    folder: String(cfg.mailbox || cfg.folder || 'INBOX'),
    assignment_group_id: item.assignment_group_id || '',
    poll_interval_seconds: String(item.poll_interval_seconds || 60),
    is_active: item.is_active,
  };
}

export function ruleToForm(item: InboundEmailRule): RuleForm {
  return {
    name: item.name,
    mailbox_id: item.mailbox_id || '',
    sort_order: String(item.sort_order ?? 100),
    stop_on_match: item.stop_on_match,
    is_active: item.is_active,
    match_from_contains: item.match_from_contains || '',
    match_subject_contains: item.match_subject_contains || '',
    match_body_contains: item.match_body_contains || '',
    match_has_ticket_ref: item.match_has_ticket_ref,
    match_in_reply_to_known: item.match_in_reply_to_known,
    action: item.action,
    require_open_incident: item.require_open_incident,
    journal_entry_type: item.journal_entry_type,
  };
}

export function nextSortOrder(items: InboundEmailRule[]): string {
  const max = items.reduce((highest, item) => Math.max(highest, Number(item.sort_order) || 0), 0);
  return String(max + 10);
}

export const INBOUND_EMAIL_QUERY_KEY = ['admin', 'inbound-email'] as const;
