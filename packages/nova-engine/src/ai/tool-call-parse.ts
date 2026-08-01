/* SPDX-License-Identifier: AGPL-3.0-only */
import type { AiChatResult, AiToolCall, AiToolDefinition, AiConversationContext } from './types';

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

const PLACEHOLDER_VALUE = /^<[^>]+>$/;

function resolveContextPlaceholders(
  args: Record<string, unknown>,
  context?: AiConversationContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && PLACEHOLDER_VALUE.test(value.trim())) {
      if (key === 'incident_id' && context?.incidentId) {
        out[key] = context.incidentId;
        continue;
      }
      if (key === 'item_id' && context?.serviceItemId) {
        out[key] = context.serviceItemId;
        continue;
      }
      continue;
    }
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

function parseToolCallObject(
  candidate: string,
  context?: AiConversationContext,
): { name: string; arguments: Record<string, unknown> } | null {
  const parsed = tryParseJsonObject(candidate);
  if (parsed && typeof parsed.name === 'string' && parsed.name.trim()) {
    const args = parsed.parameters ?? parsed.arguments ?? parsed.args ?? {};
    return {
      name: parsed.name.trim(),
      arguments: resolveContextPlaceholders(sanitizeToolArguments(args), context),
    };
  }

  const nameMatch = candidate.match(/"name"\s*:\s*"([^"]+)"/);
  if (!nameMatch) return null;

  return {
    name: nameMatch[1].trim(),
    arguments: resolveContextPlaceholders(extractParametersObject(candidate), context),
  };
}

/** Parse {"name":"...", "parameters"|"arguments": {...}} emitted as plain text by some models. */
export function tryParseEmbeddedToolCall(
  text: string,
  context?: AiConversationContext,
): { name: string; arguments: Record<string, unknown> } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;

  let candidate = trimmed;
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fence) candidate = fence[1].trim();

  return parseToolCallObject(candidate, context);
}

export function findEmbeddedToolCallInText(
  text: string,
  context?: AiConversationContext,
): { call: { name: string; arguments: Record<string, unknown> }; start: number; end: number } | null {
  const whole = tryParseEmbeddedToolCall(text, context);
  if (whole) {
    const trimmed = text.trim();
    const start = text.indexOf(trimmed.startsWith('{') ? trimmed : `{`);
    return { call: whole, start: Math.max(0, start), end: text.length };
  }

  const nameMatch = text.match(/"name"\s*:\s*"([^"]+)"/);
  if (!nameMatch || nameMatch.index === undefined) return null;

  const start = text.lastIndexOf('{', nameMatch.index);
  if (start < 0) return null;

  const objText = extractBalancedJsonObject(text, start);
  if (!objText) return null;

  const call = parseToolCallObject(objText, context);
  if (!call) return null;

  return { call, start, end: start + objText.length };
}

export function isLikelyRawToolOutput(content: string, allowedToolNames: ReadonlySet<string>): boolean {
  const embedded = findEmbeddedToolCallInText(content);
  if (embedded && allowedToolNames.has(embedded.call.name)) return true;

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
  context?: AiConversationContext,
): AiChatResult {
  if (result.toolCalls.length > 0) return result;

  const allowed = new Set(tools.map((t) => t.name));
  const embedded = findEmbeddedToolCallInText(result.content, context);
  if (!embedded || !allowed.has(embedded.call.name)) return result;

  const remainingContent =
    (result.content.slice(0, embedded.start) + result.content.slice(embedded.end)).trim();

  const toolCalls: AiToolCall[] = [
    {
      id: `embedded_${embedded.call.name}_${Date.now()}`,
      name: embedded.call.name,
      arguments: embedded.call.arguments,
    },
  ];

  return {
    ...result,
    content: remainingContent,
    toolCalls,
  };
}
