/* SPDX-License-Identifier: AGPL-3.0-only */
import { afterEach, describe, expect, it } from 'vitest';
import { shouldInjectAutomationKey } from './automation-runtime';

const ORIGINAL_ENGINE_URL = process.env.NOVA_ENGINE_URL;

afterEach(() => {
  if (ORIGINAL_ENGINE_URL === undefined) delete process.env.NOVA_ENGINE_URL;
  else process.env.NOVA_ENGINE_URL = ORIGINAL_ENGINE_URL;
});

describe('shouldInjectAutomationKey', () => {
  it('sends the key to the default engine origin', () => {
    delete process.env.NOVA_ENGINE_URL;
    expect(shouldInjectAutomationKey('http://nova-engine:4000/api/catalog/automation/ci/create')).toBe(true);
  });

  it('sends the key to localhost during development', () => {
    expect(shouldInjectAutomationKey('http://localhost:4000/api/catalog/automation/ci/lookup')).toBe(true);
  });

  it('honours NOVA_ENGINE_URL', () => {
    process.env.NOVA_ENGINE_URL = 'https://nova.internal.example:8443';
    expect(shouldInjectAutomationKey('https://nova.internal.example:8443/api/catalog/automation/x')).toBe(true);
    expect(shouldInjectAutomationKey('http://nova-engine:4000/api/catalog/automation/x')).toBe(false);
  });

  it('never sends the key to other hosts, even with the automation path', () => {
    expect(shouldInjectAutomationKey('https://attacker.example/api/catalog/automation/ci/create')).toBe(false);
    expect(shouldInjectAutomationKey('http://nova-engine:4001/api/catalog/automation/ci/create')).toBe(false);
  });

  it('ignores other engine paths and malformed URLs', () => {
    expect(shouldInjectAutomationKey('http://nova-engine:4000/api/incidents')).toBe(false);
    expect(shouldInjectAutomationKey('not a url')).toBe(false);
  });
});
