/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { evaluateSsoEmail } from './sso-policy';

const DOMAINS = ['example.com'];

describe('evaluateSsoEmail', () => {
  it('allows an allowlisted domain when email_verified is missing (Entra ID)', () => {
    expect(evaluateSsoEmail('Jane.Doe@Example.com', undefined, DOMAINS)).toEqual({
      allowed: true,
      email: 'jane.doe@example.com',
    });
  });

  it('allows an allowlisted domain when email_verified is true', () => {
    expect(evaluateSsoEmail('jane@example.com', true, DOMAINS).allowed).toBe(true);
  });

  it('rejects when email_verified is explicitly false', () => {
    expect(evaluateSsoEmail('jane@example.com', false, DOMAINS)).toEqual({ allowed: false, reason: 'email_unverified' });
    expect(evaluateSsoEmail('jane@example.com', 'false', DOMAINS)).toEqual({ allowed: false, reason: 'email_unverified' });
  });

  it('rejects domains outside the allowlist, including look-alike subdomains', () => {
    expect(evaluateSsoEmail('jane@evil.com', true, DOMAINS)).toEqual({ allowed: false, reason: 'domain_not_allowed' });
    expect(evaluateSsoEmail('jane@example.com.evil.com', true, DOMAINS).allowed).toBe(false);
    expect(evaluateSsoEmail('jane@sub.example.com', true, DOMAINS).allowed).toBe(false);
  });

  it('rejects everything when no domains are configured', () => {
    expect(evaluateSsoEmail('jane@example.com', true, [])).toEqual({ allowed: false, reason: 'no_allowed_domains' });
  });

  it('rejects malformed addresses', () => {
    expect(evaluateSsoEmail('', true, DOMAINS)).toEqual({ allowed: false, reason: 'invalid_email' });
    expect(evaluateSsoEmail('jane', true, DOMAINS)).toEqual({ allowed: false, reason: 'invalid_email' });
    expect(evaluateSsoEmail('jane@', true, DOMAINS)).toEqual({ allowed: false, reason: 'invalid_email' });
  });
});
