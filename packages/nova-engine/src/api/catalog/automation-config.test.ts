/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { getAutomationConfigFixture } from '@nova-suite/shared';
import { validateAndParseAutomationConfig, validateAutomationConfig } from './automation-config';

describe('validateAutomationConfig', () => {
  it('accepts legacy v1 state machine', () => {
    const cfg = getAutomationConfigFixture('legacyV1StateMachine');
    expect(validateAutomationConfig(cfg)).toEqual([]);
  });

  it('accepts reusable action nodes and advanced decision', () => {
    const cfg = getAutomationConfigFixture('reusableCiFlow');
    expect(validateAutomationConfig(cfg)).toEqual([]);
  });

  it('rejects ci.create action without required fields', () => {
    const cfg = getAutomationConfigFixture('invalidCiCreateMissingRequiredFields');
    expect(validateAutomationConfig(cfg)).toContain('Action "create" requires className');
    expect(validateAutomationConfig(cfg)).toContain('Action "create" requires name');
  });

  it('rejects missing schema version', () => {
    const cfg = getAutomationConfigFixture('reusableCiFlow');
    delete (cfg as Record<string, unknown>).schemaVersion;
    expect(validateAutomationConfig(cfg)).toContain('automation_config.schemaVersion must be 1');
  });

  it('returns parsed config when validation succeeds', () => {
    const cfg = getAutomationConfigFixture('reusableCiFlow');
    const result = validateAndParseAutomationConfig(cfg);
    expect(result.errors).toEqual([]);
    expect(result.config).not.toBeNull();
    expect(result.config?.schemaVersion).toBe(1);
  });
});
