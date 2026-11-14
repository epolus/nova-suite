/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { AppError } from '../middleware/errorHandler';
import { resolveSlaDueAt, startOlaClock } from './sla';
import {
  enqueueIncidentEscalationStartJob,
  enqueueNotificationDispatchStartJob,
} from '../temporal/workflow-start-queue';
import {
  extractIncidentNumber,
  isIncidentOpen,
  ruleMatches,
  type InboundEmailAction,
} from './inbound-email-match';

export {
  extractIncidentNumber,
  isIncidentOpen,
  ruleMatches,
  INCIDENT_NUMBER_RE,
} from './inbound-email-match';

export const INBOUND_EMAIL_ACTIONS = ['create_incident', 'update_incident', 'ignore'] as const;
export type { InboundEmailAction };

export type MailboxRow = {
  id: string;
  tenant_id: string;
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
};

export type InboundEmailRuleRow = {
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
  journal_entry_type: 'comment' | 'work_note';
};

export type InboundMessageInput = {
  mailbox_id: string;
  message_id: string | null;
  in_reply_to: string | null;
  from_address: string;
  to_addresses: string;
  subject: string;
  body_text: string | null;
  body_html: string | null;
};

async function findIncidentByNumber(
  client: PoolClient,
  number: string,
): Promise<{ id: string; number: string; status: string } | null> {
  const r = await client.query(
    `SELECT id, number, status FROM incidents WHERE lower(number) = lower($1) LIMIT 1`,
    [number],
  );
  return r.rows[0] || null;
}

async function findIncidentByInReplyTo(
  client: PoolClient,
  inReplyTo: string | null,
): Promise<{ id: string; number: string; status: string } | null> {
  if (!inReplyTo) return null;
  const r = await client.query(
    `SELECT i.id, i.number, i.status
     FROM email_messages em
     JOIN incidents i ON i.id = em.incident_id
     WHERE em.message_id = $1 AND em.incident_id IS NOT NULL
     ORDER BY em.created_at DESC
     LIMIT 1`,
    [inReplyTo],
  );
  return r.rows[0] || null;
}

function extractEmailAddress(fromAddress: string): string {
  const open = fromAddress.lastIndexOf('<');
  const close = fromAddress.indexOf('>', open + 1);
  const raw = open >= 0 && close > open
    ? fromAddress.slice(open + 1, close)
    : fromAddress;
  return raw.trim().toLowerCase();
}

async function resolveCallerUserId(client: PoolClient, fromAddress: string): Promise<string | null> {
  const email = extractEmailAddress(fromAddress);
  if (!email || !email.includes('@')) return null;
  const r = await client.query(
    `SELECT id FROM users WHERE lower(email) = $1 AND is_active = true LIMIT 1`,
    [email],
  );
  return r.rows[0]?.id || null;
}

/** Journal author_id is NOT NULL — fall back to an active agent when sender is unknown. */
async function resolveJournalAuthorId(
  client: PoolClient,
  fromAddress: string,
): Promise<string> {
  const callerId = await resolveCallerUserId(client, fromAddress);
  if (callerId) return callerId;
  const r = await client.query(
    `SELECT u.id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE u.is_active = true
       AND r.name IN ('admin', 'fulfiller')
     ORDER BY CASE WHEN r.name = 'admin' THEN 0 ELSE 1 END, u.created_at
     LIMIT 1`,
  );
  if (!r.rows[0]?.id) {
    throw new AppError(400, 'No active agent user available to attribute inbound email journal entries');
  }
  return r.rows[0].id as string;
}

async function resolveDefaultAssignmentGroup(
  client: PoolClient,
  mailbox: MailboxRow,
): Promise<string | null> {
  if (mailbox.assignment_group_id) return mailbox.assignment_group_id;
  const r = await client.query(
    `SELECT id FROM assignment_groups
     WHERE is_active = true
     ORDER BY CASE WHEN lower(regexp_replace(name, '[^a-z0-9]', '', 'g')) = 'servicedesk' THEN 0 ELSE 1 END, name
     LIMIT 1`,
  );
  return r.rows[0]?.id || null;
}

export async function listInboundRulesForMailbox(
  client: PoolClient,
  mailboxId: string,
): Promise<InboundEmailRuleRow[]> {
  const r = await client.query(
    `SELECT *
     FROM inbound_email_rules
     WHERE is_active = true
       AND (mailbox_id IS NULL OR mailbox_id = $1)
     ORDER BY sort_order ASC, created_at ASC`,
    [mailboxId],
  );
  return r.rows as InboundEmailRuleRow[];
}

async function appendJournal(
  client: PoolClient,
  incidentId: string,
  entryType: 'comment' | 'work_note',
  content: string,
  authorId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content, is_customer_visible)
     VALUES (current_tenant_id(), $1, $2, $3, $4, $5)`,
    [incidentId, authorId, entryType, content, entryType === 'comment'],
  );
}

async function createIncidentFromEmail(
  client: PoolClient,
  mailbox: MailboxRow,
  msg: InboundMessageInput,
  tenantId: string,
): Promise<{ id: string; number: string }> {
  const assignmentGroupId = await resolveDefaultAssignmentGroup(client, mailbox);
  if (!assignmentGroupId) {
    throw new AppError(400, 'No assignment group configured for mailbox and no Service Desk group found');
  }
  const callerId = await resolveCallerUserId(client, msg.from_address);
  const authorId = await resolveJournalAuthorId(client, msg.from_address);
  const impact = 'medium';
  const urgency = 'medium';
  const priorityResult = await client.query(
    'SELECT calculate_priority($1, $2) AS priority',
    [impact, urgency],
  );
  const priority = priorityResult.rows[0]?.priority || 3;
  const seqResult = await client.query("SELECT nextval('incident_number_seq')");
  const number = `INC${seqResult.rows[0].nextval.toString().padStart(7, '0')}`;
  const sla = await resolveSlaDueAt(client, 'incident', {
    priority,
    impact,
    urgency,
    category: null,
    serviceId: mailbox.default_service_id,
  });
  const ola = await startOlaClock(client, assignmentGroupId);
  const title = (msg.subject || 'Email incident').slice(0, 500);
  const description = [
    msg.body_text || msg.body_html || '',
    '',
    `---`,
    `From: ${msg.from_address}`,
    `To: ${msg.to_addresses}`,
  ].join('\n').slice(0, 10000);

  const inserted = await client.query(
    `INSERT INTO incidents (
       tenant_id, number, title, description,
       status, impact, urgency, priority,
       assigned_to, assignment_group_id, caller_id,
       contact_info, service_id, configuration_item_id,
       category, subcategory, sla_due_at, response_due_at, sla_definition_id,
       ola_group_id, ola_response_due_at, ola_resolution_due_at, ola_responded_at,
       ola_paused_at, ola_paused_ms
     ) VALUES (
       current_tenant_id(), $1, $2, $3,
       'new', $4, $5, $6,
       NULL, $7, $8,
       $9, $10, NULL,
       NULL, NULL, $11, $12, $13,
       $14, $15, $16, $17, $18, $19
     ) RETURNING id, number`,
    [
      number, title, description || null,
      impact, urgency, priority,
      assignmentGroupId, callerId || authorId,
      msg.from_address || null, mailbox.default_service_id,
      sla.resolutionDueAt, sla.responseDueAt, sla.slaDefinitionId,
      ola.ola_group_id, ola.ola_response_due_at, ola.ola_resolution_due_at, ola.ola_responded_at,
      ola.ola_paused_at, ola.ola_paused_ms,
    ],
  );
  const incident = inserted.rows[0] as { id: string; number: string };
  await appendJournal(
    client,
    incident.id,
    'work_note',
    `Incident created from inbound email (${mailbox.address}).`,
    authorId,
  );
  if (sla.resolutionDueAt || sla.responseDueAt) {
    enqueueIncidentEscalationStartJob({
      incidentId: incident.id,
      tenantId,
      priority,
      slaDueAt: sla.resolutionDueAt || sla.responseDueAt!,
      responseDueAt: sla.responseDueAt,
    }).catch(() => {});
  }
  enqueueNotificationDispatchStartJob({
    tenantId,
    entityType: 'incident',
    triggerKey: 'incident.created',
    entityId: incident.id,
    actorUserId: callerId || undefined,
  }).catch(() => {});
  return incident;
}

async function markMessage(
  client: PoolClient,
  messageRowId: string,
  patch: {
    processing_status: string;
    processing_notes?: string | null;
    incident_id?: string | null;
    matched_rule_id?: string | null;
  },
): Promise<void> {
  await client.query(
    `UPDATE email_messages SET
       processing_status = $2,
       processing_notes = $3,
       incident_id = COALESCE($4, incident_id),
       matched_rule_id = COALESCE($5, matched_rule_id),
       processed_at = now()
     WHERE id = $1`,
    [
      messageRowId,
      patch.processing_status,
      patch.processing_notes ?? null,
      patch.incident_id ?? null,
      patch.matched_rule_id ?? null,
    ],
  );
}

export type ProcessResult = {
  email_message_id: string;
  status: string;
  incident_id: string | null;
  incident_number: string | null;
  notes: string;
};

/**
 * Persist an inbound message (if needed) and apply ordered inbound rules.
 * Updates only apply when the incident is still open.
 */
export async function ingestAndProcessInboundEmail(
  client: PoolClient,
  tenantId: string,
  mailbox: MailboxRow,
  msg: InboundMessageInput,
): Promise<ProcessResult> {
  if (msg.message_id) {
    const existing = await client.query(
      `SELECT id, processing_status, incident_id, processing_notes
       FROM email_messages
       WHERE message_id = $1
       LIMIT 1`,
      [msg.message_id],
    );
    if (existing.rows[0]) {
      return {
        email_message_id: existing.rows[0].id,
        status: existing.rows[0].processing_status,
        incident_id: existing.rows[0].incident_id,
        incident_number: null,
        notes: existing.rows[0].processing_notes || 'Duplicate message-id; skipped',
      };
    }
  }

  const inserted = await client.query(
    `INSERT INTO email_messages (
       tenant_id, mailbox_id, direction, message_id, in_reply_to,
       from_address, to_addresses, subject, body_text, body_html, processing_status
     ) VALUES (
       current_tenant_id(), $1, 'inbound', $2, $3,
       $4, $5, $6, $7, $8, 'received'
     ) RETURNING id`,
    [
      msg.mailbox_id,
      msg.message_id,
      msg.in_reply_to,
      msg.from_address,
      msg.to_addresses,
      msg.subject,
      msg.body_text,
      msg.body_html,
    ],
  );
  const emailMessageId = inserted.rows[0].id as string;

  try {
    const ticketFromSubject = extractIncidentNumber(msg.subject);
    const ticketFromBody = extractIncidentNumber(`${msg.body_text || ''}\n${msg.body_html || ''}`);
    const ticketRef = ticketFromSubject || ticketFromBody;
    const replyIncident = await findIncidentByInReplyTo(client, msg.in_reply_to);
    const ticketIncident = ticketRef ? await findIncidentByNumber(client, ticketRef) : null;
    const linkedIncident = replyIncident || ticketIncident;

    const rules = await listInboundRulesForMailbox(client, mailbox.id);
    const matchCtx = {
      hasTicketRef: Boolean(ticketRef || replyIncident),
      inReplyKnown: Boolean(replyIncident),
    };

    let lastStatus = 'ignored';
    let lastNotes = 'No matching inbound rule; default handling applied';
    let lastIncidentId: string | null = null;
    let lastIncidentNumber: string | null = null;
    let matchedAny = false;
    let stopped = false;

    const runUpdate = async (
      incident: { id: string; number: string; status: string },
      rule: InboundEmailRuleRow | null,
    ): Promise<'updated' | 'skipped_closed'> => {
      if (rule?.require_open_incident !== false && !isIncidentOpen(incident.status)) {
        return 'skipped_closed';
      }
      const authorId = await resolveJournalAuthorId(client, msg.from_address);
      const content = [
        `Inbound email from ${msg.from_address}`,
        `Subject: ${msg.subject}`,
        '',
        msg.body_text || msg.body_html || '(no body)',
      ].join('\n').slice(0, 10000);
      await appendJournal(
        client,
        incident.id,
        rule?.journal_entry_type || 'comment',
        content,
        authorId,
      );
      return 'updated';
    };

    for (const rule of rules) {
      if (!ruleMatches(rule, msg, matchCtx)) continue;
      matchedAny = true;
      if (rule.action === 'ignore') {
        lastStatus = 'ignored';
        lastNotes = `Matched rule "${rule.name}" → ignore`;
        await markMessage(client, emailMessageId, {
          processing_status: lastStatus,
          processing_notes: lastNotes,
          matched_rule_id: rule.id,
        });
      } else if (rule.action === 'create_incident') {
        const created = await createIncidentFromEmail(client, mailbox, msg, tenantId);
        lastStatus = 'created';
        lastNotes = `Matched rule "${rule.name}" → created ${created.number}`;
        lastIncidentId = created.id;
        lastIncidentNumber = created.number;
        await markMessage(client, emailMessageId, {
          processing_status: lastStatus,
          processing_notes: lastNotes,
          incident_id: created.id,
          matched_rule_id: rule.id,
        });
      } else if (rule.action === 'update_incident') {
        if (!linkedIncident) {
          lastStatus = 'ignored';
          lastNotes = `Matched rule "${rule.name}" → update, but no ticket reference found`;
          await markMessage(client, emailMessageId, {
            processing_status: lastStatus,
            processing_notes: lastNotes,
            matched_rule_id: rule.id,
          });
        } else {
          const outcome = await runUpdate(linkedIncident, rule);
          lastStatus = outcome;
          lastIncidentId = linkedIncident.id;
          lastIncidentNumber = linkedIncident.number;
          lastNotes = outcome === 'skipped_closed'
            ? `Matched rule "${rule.name}" → incident ${linkedIncident.number} is not open`
            : `Matched rule "${rule.name}" → updated ${linkedIncident.number}`;
          await markMessage(client, emailMessageId, {
            processing_status: lastStatus,
            processing_notes: lastNotes,
            incident_id: linkedIncident.id,
            matched_rule_id: rule.id,
          });
        }
      }

      if (rule.stop_on_match) {
        stopped = true;
        break;
      }
    }

    if (!matchedAny || (!stopped && lastStatus === 'ignored' && !lastIncidentId)) {
      // Default: update open ticket if referenced, otherwise create.
      if (linkedIncident) {
        const outcome = await runUpdate(linkedIncident, null);
        lastStatus = outcome;
        lastIncidentId = linkedIncident.id;
        lastIncidentNumber = linkedIncident.number;
        lastNotes = outcome === 'skipped_closed'
          ? `Default handling: incident ${linkedIncident.number} is not open`
          : `Default handling: updated ${linkedIncident.number}`;
      } else {
        const created = await createIncidentFromEmail(client, mailbox, msg, tenantId);
        lastStatus = 'created';
        lastIncidentId = created.id;
        lastIncidentNumber = created.number;
        lastNotes = `Default handling: created ${created.number}`;
      }
      await markMessage(client, emailMessageId, {
        processing_status: lastStatus,
        processing_notes: lastNotes,
        incident_id: lastIncidentId,
      });
    }

    return {
      email_message_id: emailMessageId,
      status: lastStatus,
      incident_id: lastIncidentId,
      incident_number: lastIncidentNumber,
      notes: lastNotes,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Processing failed';
    await markMessage(client, emailMessageId, {
      processing_status: 'error',
      processing_notes: message,
    });
    throw err;
  }
}

export async function getMailbox(
  client: PoolClient,
  mailboxId: string,
): Promise<MailboxRow | null> {
  const r = await client.query(`SELECT * FROM mailboxes WHERE id = $1`, [mailboxId]);
  return (r.rows[0] as MailboxRow) || null;
}
