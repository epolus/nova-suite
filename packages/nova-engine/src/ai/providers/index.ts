/* SPDX-License-Identifier: AGPL-3.0-only */
import { config } from '../../config';
import type { LlmProvider } from './types';
import { createAzureOpenAiProvider, createOpenAiProvider } from './openai-compatible';
import { createOllamaProvider } from './ollama';

export function getLlmProvider(): LlmProvider {
  const provider = config.ai.defaultProvider;
  if (provider === 'ollama') return createOllamaProvider();
  if (provider === 'azure_openai') return createAzureOpenAiProvider();
  return createOpenAiProvider();
}

export function isAiProviderConfigured(): boolean {
  const provider = config.ai.defaultProvider;
  if (provider === 'ollama') return true;
  if (provider === 'azure_openai') {
    const { endpoint, apiKey, deployment } = config.ai.azureOpenai;
    return !!(endpoint && apiKey && deployment);
  }
  return !!config.ai.openai.apiKey;
}
