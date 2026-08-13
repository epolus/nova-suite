/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { parameterizedSet } from './parameterized-set';

const COLUMNS = ['name', 'status', 'notes'] as const;

describe('parameterizedSet', () => {
  it('binds allowlisted values in column order', () => {
    const result = parameterizedSet(COLUMNS, { notes: 'n', name: 'a', status: 'in_use' });
    expect(result).toEqual({
      sets: ['name = $1', 'status = $2', 'notes = $3'],
      values: ['a', 'in_use', 'n'],
    });
  });

  it('ignores keys that are not in the allowlist', () => {
    const result = parameterizedSet(COLUMNS, {
      name: 'ok',
      tenant_id: 'a0000000-0000-0000-0000-000000000001',
      'name = $1, tenant_id': 'injected',
      'status; DROP TABLE assets; --': 'x',
    });
    expect(result).toEqual({
      sets: ['name = $1'],
      values: ['ok'],
    });
  });

  it('returns null when nothing allowlisted is present', () => {
    expect(parameterizedSet(COLUMNS, { tenant_id: 'x', id: 'y' })).toBeNull();
  });

  it('includes explicit nulls so fields can be cleared', () => {
    const result = parameterizedSet(COLUMNS, { notes: null });
    expect(result).toEqual({
      sets: ['notes = $1'],
      values: [null],
    });
  });
});
