/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import {
  enrichChatResultWithEmbeddedToolCalls,
  isLikelyRawToolOutput,
  repairEmbeddedToolJson,
  tryParseEmbeddedToolCall,
} from './tool-call-parse';

describe('tryParseEmbeddedToolCall', () => {
  it('parses name + parameters shape from Ollama text output', () => {
    const parsed = tryParseEmbeddedToolCall(
      '{"name": "list_catalog_categories", "parameters": {"c": "IT-Service"}}',
    );
    expect(parsed?.name).toBe('list_catalog_categories');
    expect(parsed?.arguments).toEqual({ c: 'IT-Service' });
  });

  it('parses arguments alias', () => {
    const parsed = tryParseEmbeddedToolCall(
      '{"name": "search_catalog", "arguments": {"query": "laptop"}}',
    );
    expect(parsed?.name).toBe('search_catalog');
    expect(parsed?.arguments).toEqual({ query: 'laptop' });
  });

  it('parses malformed JSON with empty keys and strips blank optional args', () => {
    const parsed = tryParseEmbeddedToolCall(
      '{"name": "search_catalog", "parameters": {"query": "neuer laptop", "category": "", "limit": "", ""}}',
    );
    expect(parsed?.name).toBe('search_catalog');
    expect(parsed?.arguments).toEqual({ query: 'neuer laptop' });
  });
});

describe('repairEmbeddedToolJson', () => {
  it('removes trailing empty keys before closing brace', () => {
    expect(
      repairEmbeddedToolJson(
        '{"query": "neuer laptop", "category": "", "limit": "", ""}',
      ),
    ).toBe('{"query": "neuer laptop", "category": "", "limit": ""}');
  });
});

describe('enrichChatResultWithEmbeddedToolCalls', () => {
  const tools = [
    { name: 'list_catalog_categories', description: 'x', parameters: {} },
    { name: 'search_catalog', description: 'x', parameters: {} },
  ];

  it('converts embedded JSON into structured tool calls', () => {
    const enriched = enrichChatResultWithEmbeddedToolCalls(
      {
        content: '{"name": "list_catalog_categories", "parameters": {}}',
        toolCalls: [],
      },
      tools,
    );
    expect(enriched.toolCalls).toHaveLength(1);
    expect(enriched.content).toBe('');
  });

  it('converts malformed embedded JSON into tool calls', () => {
    const enriched = enrichChatResultWithEmbeddedToolCalls(
      {
        content:
          '{"name": "search_catalog", "parameters": {"query": "neuer laptop", "category": "", "limit": "", ""}}',
        toolCalls: [],
      },
      tools,
    );
    expect(enriched.toolCalls).toHaveLength(1);
    expect(enriched.toolCalls[0].name).toBe('search_catalog');
    expect(enriched.toolCalls[0].arguments).toEqual({ query: 'neuer laptop' });
  });

  it('detects raw tool output', () => {
    expect(
      isLikelyRawToolOutput('{"name": "list_catalog_categories", "parameters": {}}', new Set(['list_catalog_categories'])),
    ).toBe(true);
    expect(
      isLikelyRawToolOutput(
        '{"name": "search_catalog", "parameters": {"query": "neuer laptop", "category": "", "limit": "", ""}}',
        new Set(['search_catalog']),
      ),
    ).toBe(true);
  });

  it('detects tool JSON embedded in explanatory prose', () => {
    const text = `Here is a possible JSON function call:\n\n{"name": "get_incident_context", "parameters": {"incident_id": "<INCIDENT_ID>"}}`;
    expect(
      isLikelyRawToolOutput(text, new Set(['get_incident_context'])),
    ).toBe(true);
  });

  it('resolves incident placeholders from context when enriching', () => {
    const incidentId = 'a1111111-1111-1111-1111-111111111111';
    const enriched = enrichChatResultWithEmbeddedToolCalls(
      {
        content: `Use this call: {"name": "get_incident_context", "parameters": {"incident_id": "<INCIDENT_ID>"}}`,
        toolCalls: [],
      },
      [{ name: 'get_incident_context', description: 'x', parameters: {} }],
      { incidentId },
    );
    expect(enriched.toolCalls).toHaveLength(1);
    expect(enriched.toolCalls[0].arguments).toEqual({ incident_id: incidentId });
  });
});
