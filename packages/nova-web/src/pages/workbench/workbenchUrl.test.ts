/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import {
  closeWorkbenchTab,
  openWorkbenchTab,
  parseWorkbenchSearch,
  serializeWorkbenchSearch,
} from './workbenchUrl';

describe('workbench URL state', () => {
  it('drops unknown prefixes, caps tabs, and falls back when active is not a tab', () => {
    const numbers = Array.from({ length: 13 }, (_, index) => `INC${String(index).padStart(7, '0')}`);
    const state = parseWorkbenchSearch(
      `queue=nope&tabs=${numbers.join(',')},REQ0000001,nope&active=REQ0000001`,
    );
    expect(state.queue).toBe('mine');
    expect(state.tabs).toHaveLength(12);
    expect(state.tabs[0]).toBe('INC0000000');
    expect(state.tabs).not.toContain('INC0000012');
    expect(state.active).toBe('INC0000000');
  });

  it('keeps active when it belongs to the tab list', () => {
    const state = parseWorkbenchSearch('queue=sla&tabs=inc0000001,PRB0000002,CHG0000003&active=PRB0000002');
    expect(state).toEqual({
      queue: 'sla',
      tabs: ['INC0000001', 'PRB0000002', 'CHG0000003'],
      active: 'PRB0000002',
    });
  });

  it('round-trips through the query string', () => {
    const state = parseWorkbenchSearch('queue=unassigned&active=CHG0000008&tabs=CHG0000008,INC0000001');
    expect(parseWorkbenchSearch(serializeWorkbenchSearch(state))).toEqual(state);
  });

  it('opens a tab and drops the oldest once the cap is reached', () => {
    const tabs = Array.from({ length: 12 }, (_, index) => `INC${String(index).padStart(7, '0')}`);
    const next = openWorkbenchTab(
      { queue: 'mine', tabs, active: tabs[0] ?? null },
      'prb0000001',
    );
    expect(next.tabs).toHaveLength(12);
    expect(next.tabs).not.toContain('INC0000000');
    expect(next.tabs[next.tabs.length - 1]).toBe('PRB0000001');
    expect(next.active).toBe('PRB0000001');
  });

  it('moves the active tab to the next neighbor when the current tab closes', () => {
    const next = closeWorkbenchTab({
      queue: 'mine',
      tabs: ['INC0000001', 'INC0000002', 'PRB0000003'],
      active: 'INC0000002',
    }, 'INC0000002');
    expect(next.tabs).toEqual(['INC0000001', 'PRB0000003']);
    expect(next.active).toBe('PRB0000003');
  });
});
