/* SPDX-License-Identifier: AGPL-3.0-only */
import { config } from '../../config';
import type { AiChatMessage, AiChatResult, AiToolDefinition } from '../types';
import { friendlyLlmError } from '../llm-errors';
import type { LlmProvider } from './types';

type OllamaToolCall = {
  function?: { name?: string; arguments?: Record<string, unknown> };
};

type OllamaChatResponse = {
  message?: {
    role?: string;
    content?: string;
    tool_calls?: OllamaToolCall[];
  };
  error?: string;
};

function toOllamaMessages(messages: AiChatMessage[]) {
  return messages
    .filter((m) => m.role === 'system' || m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
    .map((m) => {
      if (m.role === 'assistant' && m.tool_calls?.length) {
        return {
          role: 'assistant',
          content: m.content || '',
          tool_calls: m.tool_calls.map((tc) => ({
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          })),
        };
      }
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content,
        };
      }
      return { role: m.role, content: m.content };
    });
}

function toOllamaTools(tools?: AiToolDefinition[]) {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

function parseOllamaResult(data: OllamaChatResponse): AiChatResult {
  if (data.error) {
    throw new Error(data.error);
  }
  const message = data.message;
  const toolCalls = (message?.tool_calls ?? []).map((tc, idx) => {
    let args: Record<string, unknown> = {};
    const rawArgs = tc.function?.arguments;
    if (typeof rawArgs === 'string') {
      try {
        args = JSON.parse(rawArgs) as Record<string, unknown>;
      } catch {
        args = {};
      }
    } else if (typeof rawArgs === 'object' && rawArgs !== null) {
      args = rawArgs as Record<string, unknown>;
    }
    return {
      id: `ollama_call_${idx}_${tc.function?.name ?? 'tool'}`,
      name: tc.function?.name ?? 'unknown',
      arguments: args,
    };
  });
  return {
    content: message?.content?.trim() ?? '',
    toolCalls,
  };
}

/** Ollama native chat API (POST /api/chat). Works on all standard Ollama installs. */
export class OllamaNativeProvider implements LlmProvider {
  readonly name = 'ollama';
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '').replace(/\/v1$/, '');
    this.model = model;
  }

  private async postChat(body: Record<string, unknown>): Promise<OllamaChatResponse> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 404) {
        throw new Error(
          friendlyLlmError(
            404,
            text || JSON.stringify({ error: { message: 'model not found', code: 'model_not_found' } }),
          ),
        );
      }
      throw new Error(friendlyLlmError(res.status, text));
    }
    return (await res.json()) as OllamaChatResponse;
  }

  async chat(messages: AiChatMessage[], tools?: AiToolDefinition[]): Promise<AiChatResult> {
    const ollamaTools = toOllamaTools(tools);
    const body: Record<string, unknown> = {
      model: this.model,
      messages: toOllamaMessages(messages),
      stream: false,
    };
    if (ollamaTools?.length) {
      body.tools = ollamaTools;
    }

    try {
      const data = await this.postChat(body);
      return parseOllamaResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/not found/i.test(msg) && /model/i.test(msg)) {
        throw new Error(
          `The Ollama model "${this.model}" is not available. Run \`ollama pull ${this.model}\` on the Ollama host, or set OLLAMA_MODEL to a model from \`ollama list\`.`,
        );
      }
      throw err;
    }
  }
}

export function createOllamaNativeProvider(): LlmProvider {
  const { baseUrl, model } = config.ai.ollama;
  return new OllamaNativeProvider(baseUrl, model);
}
