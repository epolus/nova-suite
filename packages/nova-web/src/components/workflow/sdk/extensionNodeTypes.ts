/* SPDX-License-Identifier: AGPL-3.0-only */
import { defineNode, scope } from './defineNode';

const approverTypeOptions = [
  { label: 'Requester manager', value: 'requester_manager' },
  { label: 'User', value: 'user' },
  { label: 'Group', value: 'group' },
  { label: 'Group manager', value: 'group_manager' },
];

export const loopForeachNode = defineNode('loop.foreach', {
  description: 'Repeat the body for each item (edges: item, done)',
  schemaProperties: {
    itemsExpr: { type: 'string' },
    maxIterations: { type: 'number', minimum: 1, maximum: 1000 },
  },
  uischemaElements: [
    { type: 'Text', scope: scope('properties.itemsExpr'), label: 'Items expression' },
    { type: 'Text', scope: scope('properties.maxIterations'), label: 'Max iterations' },
  ],
  defaults: {
    itemsExpr: '{{request.form_data.items}}',
    maxIterations: 100,
  },
});

export const parallelForkNode = defineNode('parallel.fork', {
  description: 'Run outgoing branches concurrently until the join',
  schemaProperties: {
    joinId: { type: 'string' },
  },
  uischemaElements: [
    { type: 'Text', scope: scope('properties.joinId'), label: 'Join node id' },
  ],
  defaults: { joinId: '' },
});

export const parallelJoinNode = defineNode('parallel.join', {
  description: 'Wait for all parallel branches',
  schemaProperties: {},
  uischemaElements: [],
  defaults: {},
});

export const actionApprovalNode = defineNode('action.approval', {
  description: 'Pause for a human approval (edges: approved, rejected)',
  schemaProperties: {
    approverType: { type: 'string', options: approverTypeOptions },
    approverTemplate: { type: 'string' },
    approvalName: { type: 'string' },
    instructions: { type: 'string' },
  },
  uischemaElements: [
    { type: 'Select', scope: scope('properties.approverType'), label: 'Approver type' },
    { type: 'Text', scope: scope('properties.approverTemplate'), label: 'Approver (user/group id, email, or name)' },
    { type: 'Text', scope: scope('properties.approvalName'), label: 'Approval task name' },
    { type: 'TextArea', scope: scope('properties.instructions'), label: 'Instructions' },
  ],
  defaults: {
    approverType: 'requester_manager',
    approverTemplate: '',
    approvalName: 'Approval for {{request.number}}',
    instructions: 'Please review and approve or reject this request.',
  },
});

export const variablesSetNode = defineNode('variables.set', {
  description: 'Set flow variables available as {{vars.name}}',
  schemaProperties: {
    assignmentsJson: { type: 'string' },
  },
  uischemaElements: [
    { type: 'TextArea', scope: scope('properties.assignmentsJson'), label: 'Assignments JSON' },
  ],
  defaults: {
    assignmentsJson: '{\n  "example": "{{request.form_data.example}}"\n}',
  },
});
