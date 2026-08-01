/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { getAutomationConfigFixture, validateAutomationConfig } from '@nova-suite/shared';
import { parseBuilderFromConfig, serializeBuilderToConfig } from './unifiedAutomationDesigner.internals';

describe('UnifiedAutomationDesigner contract', () => {
  it('round-trips reusable CI fixture through parse/serialize', () => {
    const fixture = getAutomationConfigFixture('reusableCiFlow');
    const parsed = parseBuilderFromConfig(fixture);
    expect(parsed.error).toBeUndefined();

    const serialized = serializeBuilderToConfig(parsed.nodes, parsed.edges);
    expect(serialized.errors).toEqual([]);
    expect(serialized.config).not.toBeNull();
    expect(validateAutomationConfig(serialized.config)).toEqual([]);
  });
});
