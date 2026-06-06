/* SPDX-License-Identifier: AGPL-3.0-only */

export type AiPersona = 'ess' | 'agent';

export type AiMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AiChatMessage {
  role: AiMessageRole;
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: AiToolCall[];
}

export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiChatResult {
  content: string;
  toolCalls: AiToolCall[];
  usage?: { promptTokens?: number; completionTokens?: number };
}

export type AiPendingActionType =
  | 'propose_create_incident'
  | 'propose_work_note'
  | 'propose_automation_config'
  | 'propose_catalog_task_patch';

export interface AiPendingActionSummary {
  id: string;
  action_type: AiPendingActionType;
  payload: Record<string, unknown>;
  validation_errors?: string[];
  expires_at: string;
}

export interface AiConversationContext {
  incidentId?: string;
  catalogTaskId?: string;
  serviceItemId?: string;
}
