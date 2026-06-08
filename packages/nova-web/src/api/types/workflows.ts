/* SPDX-License-Identifier: AGPL-3.0-only */
export interface WorkflowDefinition {
  id: string;
  name: string;
  workflow_type: string;
  draft_definition: Record<string, unknown>;
  published_definition: Record<string, unknown> | null;
  version: number;
  is_active: boolean;
  draft_updated_at: string;
  published_at: string | null;
  published_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemporalOverview {
  namespace: string;
  state: string;
  /** Best single value: server TTL if known, else configured days. */
  retentionDays: number | null;
  /** Workflow history retention from Temporal namespace (authoritative). */
  retentionDaysServer: number | null;
  /** `TEMPORAL_RETENTION_DAYS` from Nova config. */
  retentionDaysConfigured: number;
  running: number;
  failedLast24h: number;
  completedLast24h: number;
}

export interface WorkflowExecution {
  workflowId: string;
  runId: string;
  type: string;
  status: string;
  statusCode: number;
  taskQueue: string;
  startTime: string | null;
  executionTime: string | null;
  closeTime: string | null;
  historyLength: number;
}

export interface WorkflowDetail extends WorkflowExecution {
  memo: Record<string, unknown>;
  searchAttributes: Record<string, unknown>;
  parentExecution: { workflowId: string; runId: string } | null;
}

export interface HistoryEvent {
  eventId: number;
  eventType: string;
  eventTypeCode: number;
  timestamp: string | null;
  attributes: Record<string, unknown> | null;
}
