/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  getScope,
  NodeType,
  sharedProperties,
  type PaletteItem,
  type PaletteItemOrGroup,
  type UISchema,
} from '@workflowbuilder/sdk';
import { UNIFIED_BUILDER_NODE_DEFAULTS, UNIFIED_BUILDER_NODE_LABELS } from '@nova-suite/shared';
import type { UnifiedBuilderNodeType } from '@nova-suite/shared';
import { NODE_TYPE_ICONS } from './icons';

const scope = getScope;

const methodOptions = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'PATCH', value: 'PATCH' },
  { label: 'DELETE', value: 'DELETE' },
];

const onErrorOptions = [
  { label: 'Fail', value: 'fail' },
  { label: 'Continue', value: 'continue' },
  { label: 'Fallback', value: 'fallback' },
];

const endResultOptions = [
  { label: 'Success', value: 'success' },
  { label: 'Failure', value: 'failure' },
];

const notificationChannelOptions = [
  { label: 'In-app', value: 'in_app' },
  { label: 'Email', value: 'email' },
];

const ticketEntityOptions = [
  { label: 'Incident', value: 'incident' },
  { label: 'Request', value: 'request' },
];

const ticketOperationOptions = [
  { label: 'Create', value: 'create' },
  { label: 'Update', value: 'update' },
  { label: 'Close', value: 'close' },
  { label: 'Work note', value: 'work_note' },
];

const assignTargetOptions = [
  { label: 'User', value: 'user' },
  { label: 'Group', value: 'group' },
];

const scriptRuntimeOptions = [
  { label: 'JavaScript', value: 'js' },
];

function baseUi(extra: UISchema[]): UISchema {
  return {
    type: 'VerticalLayout',
    elements: [
      { type: 'Text', scope: scope('properties.label'), label: 'Label' },
      { type: 'TextArea', scope: scope('properties.description'), label: 'Description' },
      ...extra,
    ],
  };
}

function httpFields(): UISchema[] {
  return [
    { type: 'Select', scope: scope('properties.method'), label: 'Method' },
    { type: 'Text', scope: scope('properties.url'), label: 'URL' },
    { type: 'Text', scope: scope('properties.retryAttempts'), label: 'Retry attempts' },
    { type: 'Text', scope: scope('properties.retryBackoffSec'), label: 'Retry backoff (sec)' },
    { type: 'Select', scope: scope('properties.onError'), label: 'On error' },
    { type: 'Text', scope: scope('properties.fallbackNodeId'), label: 'Fallback node id' },
  ];
}

function defineNode(
  type: UnifiedBuilderNodeType,
  opts: {
    templateType?: NodeType;
    description: string;
    schemaProperties: Record<string, unknown>;
    uischemaElements: UISchema[];
    defaults: Record<string, unknown>;
  },
): PaletteItem {
  const label = UNIFIED_BUILDER_NODE_LABELS[type];
  const builtDefaults = UNIFIED_BUILDER_NODE_DEFAULTS[type];
  return {
    label,
    description: opts.description,
    type,
    icon: NODE_TYPE_ICONS[type],
    templateType: opts.templateType ?? NodeType.Node,
    defaultPropertiesData: {
      label: builtDefaults.label || label,
      description: opts.description,
      ...opts.defaults,
    },
    schema: {
      type: 'object',
      required: ['label'],
      properties: {
        ...sharedProperties,
        ...opts.schemaProperties,
      },
    },
    uischema: baseUi(opts.uischemaElements),
  } as PaletteItem;
}

const startNode = defineNode('start', {
  templateType: NodeType.StartNode,
  description: 'Workflow entry point',
  schemaProperties: {},
  uischemaElements: [],
  defaults: {},
});

const activityNode = defineNode('activity', {
  description: 'HTTP activity step',
  schemaProperties: {
    method: { type: 'string', options: methodOptions },
    url: { type: 'string' },
    retryAttempts: { type: 'number', minimum: 1 },
    retryBackoffSec: { type: 'number', minimum: 0 },
    onError: { type: 'string', options: onErrorOptions },
    fallbackNodeId: { type: 'string' },
  },
  uischemaElements: httpFields(),
  defaults: {
    method: 'GET',
    url: 'https://httpbin.org/status/200',
    retryAttempts: 1,
    retryBackoffSec: 0,
    onError: 'fail',
  },
});

const decisionNode = defineNode('decision', {
  templateType: NodeType.DecisionNode,
  description: 'Branch on a template condition',
  schemaProperties: {
    condition: { type: 'string' },
  },
  uischemaElements: [
    { type: 'Text', scope: scope('properties.condition'), label: 'Condition' },
  ],
  defaults: {
    condition: '{{response.status}}',
  },
});

const delayNode = defineNode('delay', {
  description: 'Wait before continuing',
  schemaProperties: {
    delaySeconds: { type: 'number', minimum: 1, maximum: 3600 },
  },
  uischemaElements: [
    { type: 'Text', scope: scope('properties.delaySeconds'), label: 'Delay seconds' },
  ],
  defaults: {
    delaySeconds: 5,
  },
});

const endNode = defineNode('end', {
  description: 'Terminal success or failure',
  schemaProperties: {
    endResult: { type: 'string', options: endResultOptions },
  },
  uischemaElements: [
    { type: 'Select', scope: scope('properties.endResult'), label: 'Result' },
  ],
  defaults: {
    endResult: 'success',
  },
});

const actionRestNode = defineNode('action.rest', {
  description: 'REST HTTP action',
  schemaProperties: {
    method: { type: 'string', options: methodOptions },
    url: { type: 'string' },
    retryAttempts: { type: 'number', minimum: 1 },
    retryBackoffSec: { type: 'number', minimum: 0 },
    onError: { type: 'string', options: onErrorOptions },
    fallbackNodeId: { type: 'string' },
  },
  uischemaElements: httpFields(),
  defaults: {
    method: 'GET',
    url: 'https://httpbin.org/json',
    retryAttempts: 1,
    retryBackoffSec: 0,
    onError: 'fail',
  },
});

const actionCiLookupNode = defineNode('action.ci.lookup', {
  description: 'Look up a configuration item',
  schemaProperties: {
    url: { type: 'string' },
    className: { type: 'string' },
    attributesJson: { type: 'string' },
  },
  uischemaElements: [
    { type: 'Text', scope: scope('properties.url'), label: 'URL' },
    { type: 'Text', scope: scope('properties.className'), label: 'Class name' },
    { type: 'TextArea', scope: scope('properties.attributesJson'), label: 'Attributes JSON' },
  ],
  defaults: {
    url: 'http://nova-engine:4000/api/catalog/automation/ci/lookup',
    className: 'laptop',
    attributesJson: '{\n  "asset_tag": "{{request.form_data.asset_tag}}"\n}',
  },
});

const actionCiCreateNode = defineNode('action.ci.create', {
  description: 'Create a configuration item',
  schemaProperties: {
    url: { type: 'string' },
    className: { type: 'string' },
    ciName: { type: 'string' },
    displayName: { type: 'string' },
    attributesJson: { type: 'string' },
  },
  uischemaElements: [
    { type: 'Text', scope: scope('properties.url'), label: 'URL' },
    { type: 'Text', scope: scope('properties.className'), label: 'Class name' },
    { type: 'Text', scope: scope('properties.ciName'), label: 'CI name template' },
    { type: 'Text', scope: scope('properties.displayName'), label: 'Display name template' },
    { type: 'TextArea', scope: scope('properties.attributesJson'), label: 'Attributes JSON' },
  ],
  defaults: {
    url: 'http://nova-engine:4000/api/catalog/automation/ci/create',
    className: 'laptop',
    ciName: '{{request.form_data.asset_tag}}',
    displayName: 'Laptop {{request.form_data.asset_tag}}',
    attributesJson: '{\n  "serial_number": "{{request.form_data.serial_number}}"\n}',
  },
});

const decisionAdvancedNode = defineNode('decision.advanced', {
  templateType: NodeType.DecisionNode,
  description: 'Branch on an advanced expression',
  schemaProperties: {
    expressionJson: { type: 'string' },
  },
  uischemaElements: [
    { type: 'TextArea', scope: scope('properties.expressionJson'), label: 'Expression JSON' },
  ],
  defaults: {
    expressionJson: '{\n  "op": "gt",\n  "left": { "var": "state.lookup.body.count" },\n  "right": 0\n}',
  },
});

const actionNotificationNode = defineNode('action.notification', {
  description: 'Send an in-app or email notification',
  schemaProperties: {
    channel: { type: 'string', options: notificationChannelOptions },
    recipientType: { type: 'string' },
    titleTemplate: { type: 'string' },
    bodyTemplate: { type: 'string' },
  },
  uischemaElements: [
    { type: 'Select', scope: scope('properties.channel'), label: 'Channel' },
    { type: 'Text', scope: scope('properties.recipientType'), label: 'Recipient type' },
    { type: 'Text', scope: scope('properties.titleTemplate'), label: 'Title template' },
    { type: 'TextArea', scope: scope('properties.bodyTemplate'), label: 'Body template' },
  ],
  defaults: {
    channel: 'in_app',
    recipientType: 'assignee',
    titleTemplate: 'Update on {{request.number}}',
    bodyTemplate: 'Catalog automation needs your attention.',
  },
});

const actionTicketNode = defineNode('action.ticket', {
  description: 'Create or update an incident or request',
  schemaProperties: {
    entity: { type: 'string', options: ticketEntityOptions },
    operation: { type: 'string', options: ticketOperationOptions },
    fieldsJson: { type: 'string' },
  },
  uischemaElements: [
    { type: 'Select', scope: scope('properties.entity'), label: 'Entity' },
    { type: 'Select', scope: scope('properties.operation'), label: 'Operation' },
    { type: 'TextArea', scope: scope('properties.fieldsJson'), label: 'Fields JSON' },
  ],
  defaults: {
    entity: 'incident',
    operation: 'work_note',
    fieldsJson: '{\n  "work_note": "Automation update for {{request.number}}"\n}',
  },
});

const actionAssignNode = defineNode('action.assign', {
  description: 'Assign the current catalog task to a user or group',
  schemaProperties: {
    target: { type: 'string', options: assignTargetOptions },
    assigneeTemplate: { type: 'string' },
    groupIdTemplate: { type: 'string' },
  },
  uischemaElements: [
    { type: 'Select', scope: scope('properties.target'), label: 'Target' },
    { type: 'Text', scope: scope('properties.assigneeTemplate'), label: 'Assignee template' },
    { type: 'Text', scope: scope('properties.groupIdTemplate'), label: 'Group id template' },
  ],
  defaults: {
    target: 'group',
    assigneeTemplate: '',
    groupIdTemplate: '{{request.form_data.assignment_group_id}}',
  },
});

const actionScriptNode = defineNode('action.script', {
  description: 'Run a short JavaScript step',
  schemaProperties: {
    runtime: { type: 'string', options: scriptRuntimeOptions },
    code: { type: 'string' },
  },
  uischemaElements: [
    { type: 'Select', scope: scope('properties.runtime'), label: 'Runtime' },
    { type: 'TextArea', scope: scope('properties.code'), label: 'Code' },
  ],
  defaults: {
    runtime: 'js',
    code: 'return { ok: true };\n',
  },
});

const callWorkflowNode = defineNode('call.workflow', {
  description: 'Run a published workflow definition',
  schemaProperties: {
    workflowType: { type: 'string' },
    definitionId: { type: 'string' },
    inputJson: { type: 'string' },
  },
  uischemaElements: [
    { type: 'Text', scope: scope('properties.workflowType'), label: 'Workflow type' },
    { type: 'Text', scope: scope('properties.definitionId'), label: 'Definition id' },
    { type: 'TextArea', scope: scope('properties.inputJson'), label: 'Input JSON' },
  ],
  defaults: {
    workflowType: 'catalog-fulfillment',
    definitionId: '',
    inputJson: '{\n  "requestId": "{{request.id}}"\n}',
  },
});

export const workflowNodeTypes: PaletteItemOrGroup[] = [
  {
    label: 'Flow',
    groupItems: [startNode, activityNode, decisionNode, decisionAdvancedNode, delayNode, endNode],
  },
  {
    label: 'Actions',
    groupItems: [actionRestNode, actionCiLookupNode, actionCiCreateNode, actionNotificationNode, actionTicketNode, actionAssignNode],
  },
  {
    label: 'Advanced',
    groupItems: [actionScriptNode, callWorkflowNode],
  },
];
