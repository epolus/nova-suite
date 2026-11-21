/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { adminSections, agentNav } from './layout/agentNavConfig';
import { NAV_ITEM_DEFS } from './globalSearchConfig';

describe('NAV_ITEM_DEFS sidebar parity', () => {
  const searchPaths = new Set(NAV_ITEM_DEFS.map((item) => item.path));

  it('includes every agent sidebar destination', () => {
    const missing = agentNav.map((item) => item.to).filter((path) => !searchPaths.has(path));
    expect(missing).toEqual([]);
  });

  it('includes every admin sidebar destination', () => {
    const adminPaths = adminSections.flatMap((section) => section.items.map((item) => item.to));
    const missing = adminPaths.filter((path) => !searchPaths.has(path));
    expect(missing).toEqual([]);
  });

  it('uses unique ids and paths', () => {
    const ids = NAV_ITEM_DEFS.map((item) => item.id);
    const paths = NAV_ITEM_DEFS.map((item) => item.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
