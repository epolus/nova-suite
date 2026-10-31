/* SPDX-License-Identifier: AGPL-3.0-only */
import { defineNode, scope } from './defineNode';

const approverTypeOptions = [
  { label: 'Requester manager', value: 'requester_manager' },
  { label: 'User', value: 'user' },
  { label: 'Group', value: 'group' },
  { label: 'Group manager', value: 'group_manager' },
];

export const loopForeachNode = defineNode('loop.foreach', {
  schemaProperties: {
    itemsExpr: { type: 'string' },
    maxIterations: { type: 'number', minimum: 1, maximum: 1000 },
  },
  uischemaElements: [
    { type: 'Text', scope: scope('properties.itemsExpr'), label: 'Items expression' },
    { type: 'Text', scope: scope('properties.maxIterations'), label: 'Max iterations' },
  ],
});

export const parallelForkNode = defineNode('parallel.fork', {
  schemaProperties: {
    joinId: { type: 'string' },
  },
  uischemaElements: [
    { type: 'Text', scope: scope('properties.joinId'), label: 'Join node id' },
  ],
});

export const parallelJoinNode = defineNode('parallel.join', {
  schemaProperties: {},
  uischemaElements: [],
});

export const actionApprovalNode = defineNode('action.approval', {
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
});

export const actionTaskNode = defineNode('action.task', {
  schemaProperties: {
    taskName: { type: 'string' },
    instructions: { type: 'string' },
    groupTemplate: { type: 'string' },
    assigneeTemplate: { type: 'string' },
    waitForCompletion: { type: 'boolean' },
  },
  uischemaElements: [
    { type: 'Text', scope: scope('properties.taskName'), label: 'Task name' },
    { type: 'TextArea', scope: scope('properties.instructions'), label: 'Instructions' },
    { type: 'Text', scope: scope('properties.groupTemplate'), label: 'Assignment group (name or id)' },
    { type: 'Text', scope: scope('properties.assigneeTemplate'), label: 'Assignee (user id or email)' },
    { type: 'Switch', scope: scope('properties.waitForCompletion'), label: 'Wait for completion' },
  ],
});

export const variablesSetNode = defineNode('variables.set', {
  schemaProperties: {
    assignmentsJson: { type: 'string' },
  },
  uischemaElements: [
    { type: 'TextArea', scope: scope('properties.assignmentsJson'), label: 'Assignments JSON' },
  ],
});
