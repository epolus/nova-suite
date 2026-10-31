/* SPDX-License-Identifier: AGPL-3.0-only */
import type { AutomationConfig } from '../../../automation-config';
import type { SnActionType, SnGroup, SnLogicDefinition, SnUser } from '../raw-schemas';
import type { ServiceNowFlow } from '../snapshot';

export const MAX_AUTOMATION_STATES = 80;
export const MAX_SUBFLOW_INLINE_DEPTH = 4;
/** Set when a ServiceNow approval is rejected; the flow then ends by rejecting the request. */
export const APPROVAL_REJECTED_VAR = 'sn_approval_rejected';

export type FlowLookups = {
  actionTypes: Map<string, SnActionType>;
  logicDefinitions: Map<string, SnLogicDefinition>;
  groups: Map<string, SnGroup>;
  users: Map<string, SnUser>;
  /** Subflow sys_id -> Nova workflow_type. */
  subflowTypes: Map<string, string>;
  /** Extracted flows by sys_id, used to inline subflows into their callers. */
  flows: Map<string, ServiceNowFlow>;
};

export type UnmappedStep = { label: string; definition: string; inputs: Record<string, unknown> };

export type FlowConversionResult = {
  config: AutomationConfig | null;
  preApproval: { name: string; approverType: 'requester_manager' | 'group'; groupName: string | null } | null;
  unmappedSteps: UnmappedStep[];
  scriptSteps: number;
  /** Subflow sys_ids that could not be inlined and must become call.workflow definitions. */
  calledSubflowIds: string[];
};
