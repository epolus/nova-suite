/* SPDX-License-Identifier: AGPL-3.0-only */
export const INCIDENT_NUMBER_RE = /\bINC\d{7}\b/i;

export type InboundEmailAction = 'create_incident' | 'update_incident' | 'ignore';

export type InboundEmailRuleMatchInput = {
  match_from_contains: string | null;
  match_from_regex: string | null;
  match_subject_contains: string | null;
  match_subject_regex: string | null;
  match_body_contains: string | null;
  match_has_ticket_ref: boolean;
  match_in_reply_to_known: boolean;
};

export type InboundMessageMatchInput = {
  from_address: string;
  subject: string;
  body_text: string | null;
  body_html: string | null;
};

const OPEN_STATUSES = new Set(['new', 'assigned', 'in_progress', 'pending']);

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

export function extractIncidentNumber(text: string): string | null {
  const m = text.match(INCIDENT_NUMBER_RE);
  return m ? m[0].toUpperCase() : null;
}

export function isIncidentOpen(status: string): boolean {
  return OPEN_STATUSES.has(status);
}

export function ruleMatches(
  rule: InboundEmailRuleMatchInput,
  msg: InboundMessageMatchInput,
  ctx: { hasTicketRef: boolean; inReplyKnown: boolean },
): boolean {
  const checks: boolean[] = [];

  if (rule.match_from_contains) {
    checks.push(msg.from_address.toLowerCase().includes(rule.match_from_contains.toLowerCase()));
  }
  if (rule.match_from_regex) {
    const re = safeRegex(rule.match_from_regex);
    checks.push(Boolean(re && re.test(msg.from_address)));
  }
  if (rule.match_subject_contains) {
    checks.push(msg.subject.toLowerCase().includes(rule.match_subject_contains.toLowerCase()));
  }
  if (rule.match_subject_regex) {
    const re = safeRegex(rule.match_subject_regex);
    checks.push(Boolean(re && re.test(msg.subject)));
  }
  if (rule.match_body_contains) {
    const body = `${msg.body_text || ''}\n${msg.body_html || ''}`.toLowerCase();
    checks.push(body.includes(rule.match_body_contains.toLowerCase()));
  }
  if (rule.match_has_ticket_ref) {
    checks.push(ctx.hasTicketRef);
  }
  if (rule.match_in_reply_to_known) {
    checks.push(ctx.inReplyKnown);
  }

  // A rule with no match criteria matches everything (catch-all).
  if (checks.length === 0) return true;
  return checks.every(Boolean);
}
