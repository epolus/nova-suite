/* SPDX-License-Identifier: AGPL-3.0-only */
import type { UnifiedBuilderNodeType } from './automation-config';
import { AUTOMATION_SCHEMA_VERSION } from './automation-config';

export type UnifiedBuilderNodeDefaults = {
  label: string;
  nodeType: UnifiedBuilderNodeType;
  method?: string;
  url?: string;
  condition?: string;
  delaySeconds?: number;
  retryAttempts?: number;
  retryBackoffSec?: number;
  onError?: 'fail' | 'continue' | 'fallback';
  endResult?: 'success' | 'failure';
  className?: string;
  ciName?: string;
  displayName?: string;
  attributesJson?: string;
  expressionJson?: string;
};

export const UNIFIED_BUILDER_EMPTY_ATTRIBUTES_JSON = '{\n  \n}';

export const UNIFIED_BUILDER_PARSE_FALLBACK_EXPRESSION: Record<string, unknown> = {
  op: 'eq',
  left: { var: 'response.status' },
  right: 200,
};

export const UNIFIED_BUILDER_DEFAULT_AUTOMATION_CONFIG: Record<string, unknown> = {
  kind: 'state_machine',
  schemaVersion: AUTOMATION_SCHEMA_VERSION,
  startAt: 'activity-1',
  states: [
    {
      id: 'activity-1',
      type: 'activity',
      method: 'GET',
      url: 'https://httpbin.org/status/200',
      transitions: [
        { to: 'end-success', when: 'success' },
        { to: 'end-failure', when: 'failure' },
      ],
    },
    { id: 'end-success', type: 'end', result: 'success' },
    { id: 'end-failure', type: 'end', result: 'failure' },
  ],
};

export const UNIFIED_BUILDER_NODE_DEFAULTS: Record<UnifiedBuilderNodeType, UnifiedBuilderNodeDefaults> = {
  start: { label: 'Start', nodeType: 'start' },
  activity: { label: 'activity-step', nodeType: 'activity', method: 'GET', url: 'https://httpbin.org/status/200' },
  decision: { label: 'decision-step', nodeType: 'decision', condition: '{{response.status}}' },
  delay: { label: 'delay-step', nodeType: 'delay', delaySeconds: 5 },
  end: { label: 'end-step', nodeType: 'end', endResult: 'success' },
  'action.rest': { label: 'rest-action', nodeType: 'action.rest', method: 'GET', url: 'https://httpbin.org/json' },
  'action.ci.lookup': {
    label: 'ci-lookup',
    nodeType: 'action.ci.lookup',
    method: 'POST',
    url: 'http://nova-engine:4000/api/catalog/automation/ci/lookup',
    className: 'laptop',
    attributesJson: '{\n  "asset_tag": "{{request.form_data.asset_tag}}"\n}',
  },
  'action.ci.create': {
    label: 'ci-create',
    nodeType: 'action.ci.create',
    method: 'POST',
    url: 'http://nova-engine:4000/api/catalog/automation/ci/create',
    className: 'laptop',
    ciName: '{{request.form_data.asset_tag}}',
    displayName: 'Laptop {{request.form_data.asset_tag}}',
    attributesJson: '{\n  "serial_number": "{{request.form_data.serial_number}}"\n}',
  },
  'decision.advanced': {
    label: 'advanced-decision',
    nodeType: 'decision.advanced',
    expressionJson: '{\n  "op": "gt",\n  "left": { "var": "state.lookup.body.count" },\n  "right": 0\n}',
  },
};
