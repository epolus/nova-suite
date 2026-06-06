/* SPDX-License-Identifier: AGPL-3.0-only */
import type { AiChatMessage, AiChatResult, AiToolDefinition } from '../types';

export interface LlmProvider {
  readonly name: string;
  chat(messages: AiChatMessage[], tools?: AiToolDefinition[]): Promise<AiChatResult>;
  streamChat?(
    messages: AiChatMessage[],
    tools?: AiToolDefinition[],
  ): AsyncGenerator<{ type: 'token'; content: string } | { type: 'done'; result: AiChatResult }>;
}
