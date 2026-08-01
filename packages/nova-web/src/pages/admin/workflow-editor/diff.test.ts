/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { diffObjects } from './diff';

describe('diffObjects', () => {
  it('returns empty diff for equal objects', () => {
    const a = { x: 1, nested: { y: true } };
    const b = { x: 1, nested: { y: true } };
    expect(diffObjects(a, b)).toEqual([]);
  });

  it('detects added removed and changed paths', () => {
    const before = { name: 'wf', nested: { enabled: true }, oldKey: 1 };
    const after = { name: 'wf-2', nested: { enabled: true }, newKey: 2 };
    const diff = diffObjects(before, after);
    expect(diff.some((d) => d.path === 'name' && d.kind === 'changed')).toBe(true);
    expect(diff.some((d) => d.path === 'oldKey' && d.kind === 'removed')).toBe(true);
    expect(diff.some((d) => d.path === 'newKey' && d.kind === 'added')).toBe(true);
  });
});
