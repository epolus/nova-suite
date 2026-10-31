/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { resolveGroupManagerLookup } from './catalog-activities';

describe('resolveGroupManagerLookup', () => {
  it('prefers the form target group name over the catalog fallback group', () => {
    expect(resolveGroupManagerLookup({
      targetGroupName: 'Network Operations',
      fallbackGroupId: 'a5000000-0000-0000-0000-000000000001',
    })).toEqual({
      id: null,
      name: 'Network Operations',
    });
  });

  it('prefers an explicit target group id', () => {
    expect(resolveGroupManagerLookup({
      targetGroupId: 'aa000000-0000-0000-0000-000000000099',
      targetGroupName: 'Network Operations',
      fallbackGroupId: 'a5000000-0000-0000-0000-000000000001',
    })).toEqual({
      id: 'aa000000-0000-0000-0000-000000000099',
      name: 'Network Operations',
    });
  });

  it('falls back to the catalog task group when the form has no target', () => {
    expect(resolveGroupManagerLookup({
      fallbackGroupId: 'a5000000-0000-0000-0000-000000000001',
    })).toEqual({
      id: 'a5000000-0000-0000-0000-000000000001',
      name: null,
    });
  });
});
