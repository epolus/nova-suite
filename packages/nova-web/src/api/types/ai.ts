/* SPDX-License-Identifier: AGPL-3.0-only */
export type AiPersona = 'ess' | 'agent';

export interface AiConversationContext {
  incidentId?: string;
  catalogTaskId?: string;
  serviceItemId?: string;
}

export interface AiPendingAction {
  id: string;
  action_type: string;
  payload: Record<string, unknown>;
  validation_errors?: string[];
  status?: string;
  expires_at: string;
}

export interface AiChatMessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface AiStatus {
  enabled: boolean;
  ess_enabled: boolean;
  agent_enabled: boolean;
  provider_configured: boolean;
  default_provider: string;
}
