/* SPDX-License-Identifier: AGPL-3.0-only */
import type { AiChatResult, AiToolCall, AiToolDefinition } from './types';

function sanitizeToolArguments(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key.trim()) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    out[key] = value;
  }
  return out;
}

/** Fix common invalid JSON emitted by local models (empty keys, trailing commas). */
export function repairEmbeddedToolJson(text: string): string {
  let s = text.trim();
  s = s.replace(/,\s*""\s*(?::\s*(?:""|null))?\s*(?=[}\]])/g, '');
  s = s.replace(/,\s*([}\]])/g, '$1');
  return s;
}

function extractBalancedJsonObject(text: string, openBraceIndex: number): string | null {
  let depth = 0;
  for (let i = openBraceIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(openBraceIndex, i + 1);
    }
  }
  return null;
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const repaired = repairEmbeddedToolJson(text);
  try {
    const obj = JSON.parse(repaired) as unknown;
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return obj as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return null;
}

function extractParametersObject(text: string): Record<string, unknown> {
  const keyMatch = text.match(/"(?:parameters|arguments|args)"\s*:\s*\{/);
  if (!keyMatch || keyMatch.index === undefined) return {};

  const openBrace = text.indexOf('{', keyMatch.index + keyMatch[0].length - 1);
  if (openBrace < 0) return {};

  const objText = extractBalancedJsonObject(text, openBrace);
  if (!objText) return {};

  const parsed = tryParseJsonObject(objText);
  return parsed ? sanitizeToolArguments(parsed) : {};
}

/** Parse {"name":"...", "parameters"|"arguments": {...}} emitted as plain text by some models. */
export function tryParseEmbeddedToolCall(
  text: string,
): { name: string; arguments: Record<string, unknown> } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;

  let candidate = trimmed;
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fence) candidate = fence[1].trim();

  const parsed = tryParseJsonObject(candidate);
  if (parsed && typeof parsed.name === 'string' && parsed.name.trim()) {
    const args = parsed.parameters ?? parsed.arguments ?? parsed.args ?? {};
    return {
      name: parsed.name.trim(),
      arguments: sanitizeToolArguments(args),
    };
  }

  const nameMatch = candidate.match(/"name"\s*:\s*"([^"]+)"/);
  if (!nameMatch) return null;

  return {
    name: nameMatch[1].trim(),
    arguments: extractParametersObject(candidate),
  };
}

export function isLikelyRawToolOutput(content: string, allowedToolNames: ReadonlySet<string>): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{')) return false;

  const parsed = tryParseEmbeddedToolCall(content);
  if (parsed && allowedToolNames.has(parsed.name)) return true;

  const nameMatch = trimmed.match(/"name"\s*:\s*"([^"]+)"/);
  if (!nameMatch) return false;
  const name = nameMatch[1].trim();
  if (!allowedToolNames.has(name)) return false;

  return /"(?:parameters|arguments|args)"\s*:/.test(trimmed);
}

export function enrichChatResultWithEmbeddedToolCalls(
  result: AiChatResult,
  tools: AiToolDefinition[],
): AiChatResult {
  if (result.toolCalls.length > 0) return result;

  const allowed = new Set(tools.map((t) => t.name));
  const parsed = tryParseEmbeddedToolCall(result.content);
  if (!parsed || !allowed.has(parsed.name)) return result;

  const toolCalls: AiToolCall[] = [
    {
      id: `embedded_${parsed.name}_${Date.now()}`,
      name: parsed.name,
      arguments: parsed.arguments,
    },
  ];

  return {
    ...result,
    content: '',
    toolCalls,
  };
}
