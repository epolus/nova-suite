/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { roleBypassesRls } from './db';

describe('roleBypassesRls', () => {
  it('returns true for superusers even without BYPASSRLS', () => {
    expect(roleBypassesRls({ rolsuper: true, rolbypassrls: false })).toBe(true);
  });

  it('returns true for BYPASSRLS roles that are not superuser', () => {
    expect(roleBypassesRls({ rolsuper: false, rolbypassrls: true })).toBe(true);
  });

  it('returns false for a NOSUPERUSER NOBYPASSRLS role', () => {
    expect(roleBypassesRls({ rolsuper: false, rolbypassrls: false })).toBe(false);
  });
});
