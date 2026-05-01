/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { getAutomationConfigFixture } from '@nova-suite/shared';
import { __test__ } from './catalog-automation-activities';

describe('catalog automation v2 helpers', () => {
  it('evaluates advanced expressions with state context', () => {
    const ok = __test__.evaluateAdvancedCondition(
      {
        op: 'and',
        conditions: [
          { op: 'gt', left: { var: 'state.lookup.body.count' }, right: 0 },
          { op: 'eq', left: { var: 'request.form_data.asset_tag' }, right: 'LAP-123' },
        ],
      },
      {
        request: { form_data: { asset_tag: 'LAP-123' } },
        state: { lookup: { body: { count: 1 } } },
      },
    );
    expect(ok).toBe(true);
  });

  it('builds ci.lookup action payload with request context', () => {
    const cfg = getAutomationConfigFixture('reusableCiFlow');
    const lookup = (cfg.states as Array<Record<string, unknown>>).find((s) => s.id === 'lookup');
    if (!lookup) throw new Error('lookup state missing from fixture');
    const lookupState = lookup as unknown as Parameters<typeof __test__.toHttpActivityState>[0];
    const state = __test__.toHttpActivityState(
      lookupState,
      { request: { id: 'req-1', form_data: { asset_tag: 'LAP-900' } } },
    );
    expect(state.method).toBe('POST');
    expect(state.body).toContain('"request_id":"req-1"');
    expect(state.body).toContain('"asset_tag":"LAP-900"');
  });

  it('builds ci.create action payload with interpolated fields', () => {
    const cfg = getAutomationConfigFixture('reusableCiFlow');
    const create = (cfg.states as Array<Record<string, unknown>>).find((s) => s.id === 'create');
    if (!create) throw new Error('create state missing from fixture');
    const createState = create as unknown as Parameters<typeof __test__.toHttpActivityState>[0];
    const state = __test__.toHttpActivityState(
      createState,
      { request: { id: 'req-2', form_data: { asset_tag: 'LAP-42', serial: 'S42' } } },
    );
    expect(state.method).toBe('POST');
    expect(state.body).toContain('"class_name":"laptop"');
    expect(state.body).toContain('"name":"LAP-42"');
    expect(state.body).toContain('"serial_number":"S42"');
  });
});
