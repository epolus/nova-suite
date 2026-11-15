/* SPDX-License-Identifier: AGPL-3.0-only */
// Decides whether an SSO identity that is not yet linked to a Nova user may be
// linked to an existing account or auto-provisioned.

export type SsoEmailDecision =
  | { allowed: true; email: string }
  | { allowed: false; reason: 'email_unverified' | 'domain_not_allowed' | 'no_allowed_domains' | 'invalid_email' };

function emailVerifiedIsFalse(value: unknown): boolean {
  return value === false || value === 'false';
}

/**
 * `email_verified` is optional in OIDC and Entra ID usually omits it, so only an
 * explicit `false` is rejected; the domain allowlist is what grants trust.
 */
export function evaluateSsoEmail(
  email: string | undefined,
  emailVerified: unknown,
  allowedDomains: readonly string[],
): SsoEmailDecision {
  const normalized = (email || '').trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return { allowed: false, reason: 'invalid_email' };
  if (emailVerifiedIsFalse(emailVerified)) return { allowed: false, reason: 'email_unverified' };
  if (allowedDomains.length === 0) return { allowed: false, reason: 'no_allowed_domains' };
  const domain = normalized.slice(at + 1);
  if (!allowedDomains.includes(domain)) return { allowed: false, reason: 'domain_not_allowed' };
  return { allowed: true, email: normalized };
}
