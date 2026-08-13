/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { roleBypassesRls } from './db';

describe('roleBypassesRls', () => {
  it('returns true for superusers', () => {
    expect(roleBypassesRls({ rolsuper: true, rolbypassrls: false })).toBe(true);
  });

  it('returns false for nova_runtime-style roles', () => {
    expect(roleBypassesRls({ rolsuper: false, rolbypassrls: false })).toBe(false);
  });
});
