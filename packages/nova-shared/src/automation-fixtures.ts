/* SPDX-License-Identifier: AGPL-3.0-only */

import { AUTOMATION_SCHEMA_VERSION } from './automation-config';

export type AutomationConfigFixture = Record<string, unknown>;

const LEGACY_V1_STATE_MACHINE: AutomationConfigFixture = {
  kind: 'state_machine',
  schemaVersion: AUTOMATION_SCHEMA_VERSION,
  startAt: 'a1',
  states: [
    {
      id: 'a1',
      type: 'activity',
      method: 'GET',
      url: 'https://example.test/api/{{request.id}}',
      transitions: [{ to: 'done', when: 'success' }, { to: 'failed', when: 'failure' }],
    },
    { id: 'done', type: 'end', result: 'success' },
    { id: 'failed', type: 'end', result: 'failure' },
  ],
};

const REUSABLE_CI_FLOW: AutomationConfigFixture = {
  kind: 'state_machine',
  schemaVersion: AUTOMATION_SCHEMA_VERSION,
  startAt: 'lookup',
  states: [
    {
      id: 'lookup',
      type: 'action.ci.lookup',
      url: 'http://localhost:4000/api/catalog/automation/ci/lookup',
      className: 'laptop',
      attributes: { asset_tag: '{{request.form_data.asset_tag}}' },
      transitions: [{ to: 'branch', when: 'success' }, { to: 'failed', when: 'failure' }],
    },
    {
      id: 'branch',
      type: 'decision.advanced',
      expression: {
        op: 'gt',
        left: { var: 'state.lookup.body.count' },
        right: 0,
      },
      transitions: [{ to: 'done', when: 'true' }, { to: 'create', when: 'false' }],
    },
    {
      id: 'create',
      type: 'action.ci.create',
      url: 'http://localhost:4000/api/catalog/automation/ci/create',
      className: 'laptop',
      name: '{{request.form_data.asset_tag}}',
      displayName: 'Laptop {{request.form_data.asset_tag}}',
      attributes: { serial_number: '{{request.form_data.serial}}' },
      transitions: [{ to: 'done', when: 'success' }, { to: 'failed', when: 'failure' }],
    },
    { id: 'done', type: 'end', result: 'success' },
    { id: 'failed', type: 'end', result: 'failure' },
  ],
};

const INVALID_CI_CREATE_MISSING_REQUIRED_FIELDS: AutomationConfigFixture = {
  kind: 'state_machine',
  schemaVersion: AUTOMATION_SCHEMA_VERSION,
  startAt: 'create',
  states: [
    {
      id: 'create',
      type: 'action.ci.create',
      url: 'http://localhost:4000/api/catalog/automation/ci/create',
      transitions: [{ to: 'done', when: 'success' }, { to: 'failed', when: 'failure' }],
    },
    { id: 'done', type: 'end', result: 'success' },
    { id: 'failed', type: 'end', result: 'failure' },
  ],
};

export const AUTOMATION_CONFIG_FIXTURES = {
  legacyV1StateMachine: LEGACY_V1_STATE_MACHINE,
  reusableCiFlow: REUSABLE_CI_FLOW,
  invalidCiCreateMissingRequiredFields: INVALID_CI_CREATE_MISSING_REQUIRED_FIELDS,
} as const;

export type AutomationConfigFixtureName = keyof typeof AUTOMATION_CONFIG_FIXTURES;

export function getAutomationConfigFixture(name: AutomationConfigFixtureName): AutomationConfigFixture {
  return JSON.parse(JSON.stringify(AUTOMATION_CONFIG_FIXTURES[name])) as AutomationConfigFixture;
}
