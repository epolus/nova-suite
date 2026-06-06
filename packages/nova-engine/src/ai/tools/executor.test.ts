/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { validateAutomationConfig } from '@nova-suite/shared';
import { PROPOSE_TOOL_NAMES } from './definitions';

describe('AI tool registry', () => {
  it('marks propose tools for pending flow', () => {
    expect(PROPOSE_TOOL_NAMES.has('propose_create_incident')).toBe(true);
    expect(PROPOSE_TOOL_NAMES.has('propose_automation_config')).toBe(true);
    expect(PROPOSE_TOOL_NAMES.has('search_knowledge')).toBe(false);
  });
});

describe('automation proposals', () => {
  it('rejects invalid automation_config payloads', () => {
    const errors = validateAutomationConfig({ kind: 'state_machine', schemaVersion: 2 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts minimal valid state_machine', () => {
    const cfg = {
      kind: 'state_machine',
      schemaVersion: 1,
      startAt: 'done',
      states: [{ id: 'done', type: 'end', result: 'success' }],
    };
    expect(validateAutomationConfig(cfg)).toEqual([]);
  });
});
