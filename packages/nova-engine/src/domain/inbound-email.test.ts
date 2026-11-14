/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import {
  extractIncidentNumber,
  isIncidentOpen,
  ruleMatches,
  type InboundEmailRuleMatchInput,
  type InboundMessageMatchInput,
} from './inbound-email-match';

function rule(partial: Partial<InboundEmailRuleMatchInput>): InboundEmailRuleMatchInput {
  return {
    match_from_contains: null,
    match_from_regex: null,
    match_subject_contains: null,
    match_subject_regex: null,
    match_body_contains: null,
    match_has_ticket_ref: false,
    match_in_reply_to_known: false,
    ...partial,
  };
}

const msg: InboundMessageMatchInput = {
  from_address: 'alice@example.com',
  subject: 'Re: INC0000123 printer down',
  body_text: 'Still broken',
  body_html: null,
};

describe('inbound email helpers', () => {
  it('extracts incident numbers case-insensitively', () => {
    expect(extractIncidentNumber('Please update inc0000123')).toBe('INC0000123');
    expect(extractIncidentNumber('no ticket here')).toBeNull();
  });

  it('treats only open statuses as updatable', () => {
    expect(isIncidentOpen('new')).toBe(true);
    expect(isIncidentOpen('resolved')).toBe(false);
    expect(isIncidentOpen('closed')).toBe(false);
  });

  it('matches catch-all rules and AND criteria', () => {
    expect(ruleMatches(rule({}), msg, { hasTicketRef: true, inReplyKnown: false })).toBe(true);
    expect(ruleMatches(
      rule({ match_from_contains: 'alice', match_has_ticket_ref: true }),
      msg,
      { hasTicketRef: true, inReplyKnown: false },
    )).toBe(true);
    expect(ruleMatches(
      rule({ match_from_contains: 'bob', match_has_ticket_ref: true }),
      msg,
      { hasTicketRef: true, inReplyKnown: false },
    )).toBe(false);
  });
});
