/* SPDX-License-Identifier: AGPL-3.0-only */
import { config } from '../../config';
import { OpenAiCompatibleProvider } from './openai-compatible';
import { createOllamaNativeProvider } from './ollama-native';
import type { LlmProvider } from './types';

/**
 * Default: native Ollama API (POST /api/chat).
 * Set OLLAMA_USE_OPENAI_COMPAT=true only if your Ollama build serves /v1/chat/completions.
 */
export function createOllamaProvider(): LlmProvider {
  if (process.env.OLLAMA_USE_OPENAI_COMPAT === 'true') {
    const { baseUrl, model } = config.ai.ollama;
    return new OpenAiCompatibleProvider({
      name: 'ollama',
      baseUrl: `${baseUrl.replace(/\/$/, '').replace(/\/v1$/, '')}/v1`,
      apiKey: 'ollama',
      model,
    });
  }
  return createOllamaNativeProvider();
}
