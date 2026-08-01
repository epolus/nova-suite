/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { OllamaNativeProvider } from './ollama-native';

describe('OllamaNativeProvider', () => {
  it('strips trailing /v1 from base URL', () => {
    const provider = new OllamaNativeProvider('http://ollama:11434/v1', 'llama3.2');
    expect((provider as unknown as { baseUrl: string }).baseUrl).toBe('http://ollama:11434');
  });
});
