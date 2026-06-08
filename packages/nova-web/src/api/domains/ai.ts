/* SPDX-License-Identifier: AGPL-3.0-only */
import { request, BASE, getToken } from '../http';
import type { AiChatMessageRow, AiConversationContext, AiPendingAction, AiPersona, AiStatus } from '../types';

export const ai = {
  status: () => request<AiStatus>('/ai/status'),
  createConversation: (payload: { persona: AiPersona; context?: AiConversationContext }) =>
    request<{ conversation: { id: string; persona: AiPersona; context: AiConversationContext } }>(
      '/ai/conversations',
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  getConversation: (id: string) =>
    request<{
      conversation: { id: string; persona: AiPersona; context: AiConversationContext };
      messages: AiChatMessageRow[];
      pending_actions: AiPendingAction[];
    }>(`/ai/conversations/${id}`),
  confirmAction: (conversationId: string, actionId: string) =>
    request<{ result: Record<string, unknown> }>(
      `/ai/conversations/${conversationId}/actions/${actionId}/confirm`,
      { method: 'POST' },
    ),
  cancelAction: (conversationId: string, actionId: string) =>
    request<void>(`/ai/conversations/${conversationId}/actions/${actionId}`, { method: 'DELETE' }),
  sendMessageStream: async (
    conversationId: string,
    content: string,
    handlers: {
      context?: AiConversationContext;
      onToken: (chunk: string) => void;
      onDone: (data: { content: string; pending_actions: AiPendingAction[] }) => void;
      onError: (message: string) => void;
    },
  ) => {
    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE}/ai/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content,
        stream: true,
        ...(handlers.context ? { context: handlers.context } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      handlers.onError(typeof body.error === 'string' ? body.error : 'AI request failed');
      return;
    }
    const reader = res.body?.getReader();
    if (!reader) {
      handlers.onError('No response stream');
      return;
    }
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const lines = part.split('\n');
        let event = 'message';
        let data = '';
        for (const line of lines) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) continue;
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          if (event === 'token' && typeof parsed.content === 'string') {
            handlers.onToken(parsed.content);
          } else if (event === 'done') {
            handlers.onDone({
              content: String(parsed.content ?? ''),
              pending_actions: (parsed.pending_actions as AiPendingAction[]) ?? [],
            });
          } else if (event === 'error') {
            handlers.onError(String(parsed.error ?? 'AI error'));
          }
        } catch {
          // ignore
        }
      }
    }
  },
};
