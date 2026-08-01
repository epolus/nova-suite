/* SPDX-License-Identifier: AGPL-3.0-only */
import { config } from '../../config';
import type { AiChatMessage, AiChatResult, AiToolDefinition } from '../types';
import { friendlyLlmError } from '../llm-errors';
import type { LlmProvider } from './types';

type OpenAiMessage = {
  role: string;
  content?: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
};

function toApiMessages(messages: AiChatMessage[]): OpenAiMessage[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content, tool_call_id: m.tool_call_id, name: m.name };
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

function toApiTools(tools?: AiToolDefinition[]) {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

function parseResult(data: {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}): AiChatResult {
  const message = data.choices?.[0]?.message;
  const toolCalls = (message?.tool_calls ?? []).map((tc) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
    } catch {
      args = {};
    }
    return { id: tc.id, name: tc.function.name, arguments: args };
  });
  return {
    content: message?.content?.trim() ?? '',
    toolCalls,
    usage: {
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    },
  };
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly extraHeaders: Record<string, string>;
  private readonly authMode: 'bearer' | 'api-key';
  private readonly chatPath: string;

  constructor(opts: {
    name: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    extraHeaders?: Record<string, string>;
    authMode?: 'bearer' | 'api-key';
    chatPath?: string;
  }) {
    this.name = opts.name;
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.extraHeaders = opts.extraHeaders ?? {};
    this.authMode = opts.authMode ?? 'bearer';
    this.chatPath = opts.chatPath ?? '/chat/completions';
  }

  private headers(): Record<string, string> {
    const base: Record<string, string> = { 'Content-Type': 'application/json', ...this.extraHeaders };
    if (this.authMode === 'api-key') {
      base['api-key'] = this.apiKey;
    } else if (this.apiKey && this.apiKey !== 'ollama') {
      base.Authorization = `Bearer ${this.apiKey}`;
    }
    return base;
  }

  async chat(messages: AiChatMessage[], tools?: AiToolDefinition[]): Promise<AiChatResult> {
    const res = await fetch(`${this.baseUrl}${this.chatPath}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.model,
        messages: toApiMessages(messages),
        tools: toApiTools(tools),
        tool_choice: tools?.length ? 'auto' : undefined,
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(friendlyLlmError(res.status, body));
    }
    const data = (await res.json()) as Parameters<typeof parseResult>[0];
    return parseResult(data);
  }

  async *streamChat(
    messages: AiChatMessage[],
    tools?: AiToolDefinition[],
  ): AsyncGenerator<{ type: 'token'; content: string } | { type: 'done'; result: AiChatResult }> {
    const res = await fetch(`${this.baseUrl}${this.chatPath}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.model,
        messages: toApiMessages(messages),
        tools: toApiTools(tools),
        tool_choice: tools?.length ? 'auto' : undefined,
        temperature: 0.2,
        stream: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(friendlyLlmError(res.status, body));
    }
    const reader = res.body?.getReader();
    if (!reader) {
      const result = await this.chat(messages, tools);
      if (result.content) yield { type: 'token', content: result.content };
      yield { type: 'done', result };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    const toolCallsByIndex = new Map<number, { id: string; name: string; arguments: string }>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const chunk = JSON.parse(payload) as {
            choices?: Array<{
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  index: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
            }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            content += delta.content;
            yield { type: 'token', content: delta.content };
          }
          for (const tc of delta?.tool_calls ?? []) {
            const existing = toolCallsByIndex.get(tc.index) ?? { id: '', name: '', arguments: '' };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) existing.arguments += tc.function.arguments;
            toolCallsByIndex.set(tc.index, existing);
          }
        } catch {
          // ignore malformed SSE chunks
        }
      }
    }

    const toolCalls = [...toolCallsByIndex.values()].map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.arguments || '{}') as Record<string, unknown>;
      } catch {
        args = {};
      }
      return { id: tc.id || `call_${tc.name}`, name: tc.name, arguments: args };
    });

    yield {
      type: 'done',
      result: { content, toolCalls, usage: undefined },
    };
  }
}

export function createOpenAiProvider(): LlmProvider {
  const { apiKey, baseUrl, model } = config.ai.openai;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  return new OpenAiCompatibleProvider({ name: 'openai', baseUrl, apiKey, model });
}

export function createAzureOpenAiProvider(): LlmProvider {
  const { endpoint, apiKey, deployment, apiVersion } = config.ai.azureOpenai;
  if (!endpoint || !apiKey || !deployment) {
    throw new Error('Azure OpenAI is not fully configured (endpoint, api key, deployment)');
  }
  const base = endpoint.replace(/\/$/, '');
  const version = encodeURIComponent(apiVersion);
  return new OpenAiCompatibleProvider({
    name: 'azure_openai',
    baseUrl: `${base}/openai/deployments/${deployment}`,
    apiKey,
    model: deployment,
    authMode: 'api-key',
    chatPath: `/chat/completions?api-version=${version}`,
  });
}
