/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Edge, Node } from '@xyflow/react';

export type BuilderNodeType = 'start' | 'activity' | 'decision' | 'delay' | 'end';

export type ActivityErrorPolicy = 'fail' | 'continue' | 'fallback';

export type BuilderNodeData = {
  label: string;
  activityName?: string;
  timeoutSec?: number;
  retryAttempts?: number;
  retryBackoffSec?: number;
  onError?: ActivityErrorPolicy;
  fallbackNodeId?: string;
  condition?: string;
  delaySeconds?: number;
};

export type TemporalTransition = { to: string; when?: string };

export type TemporalState = {
  id: string;
  name: string;
  type: BuilderNodeType;
  activityName?: string;
  timeoutSec?: number;
  retryAttempts?: number;
  retryBackoffSec?: number;
  onError?: ActivityErrorPolicy;
  fallbackNodeId?: string;
  condition?: string;
  delaySeconds?: number;
  transitions: TemporalTransition[];
};

export type TemporalWorkflowJson = {
  schemaVersion: number;
  workflowType: string;
  startAt: string | null;
  states: TemporalState[];
  warnings: string[];
};

export type ValidationResult = {
  errors: string[];
  warnings: string[];
};

export type SerializedWorkflow = {
  workflow: TemporalWorkflowJson;
  validation: ValidationResult;
};

export type BuilderGraph = {
  nodes: Node<BuilderNodeData>[];
  edges: Edge[];
};
