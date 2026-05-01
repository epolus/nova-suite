/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { getAutomationConfigFixture, validateAutomationConfig } from '@nova-suite/shared';
import { __test__ } from './UnifiedAutomationDesigner';

describe('UnifiedAutomationDesigner contract', () => {
  it('round-trips reusable CI fixture through parse/serialize', () => {
    const fixture = getAutomationConfigFixture('reusableCiFlow');
    const parsed = __test__.parseBuilderFromConfig(fixture);
    expect(parsed.error).toBeUndefined();

    const serialized = __test__.serializeBuilderToConfig(parsed.nodes, parsed.edges);
    expect(serialized.errors).toEqual([]);
    expect(serialized.config).not.toBeNull();
    expect(validateAutomationConfig(serialized.config)).toEqual([]);
  });
});
