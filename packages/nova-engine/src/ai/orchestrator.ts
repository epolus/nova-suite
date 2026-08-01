/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { config } from '../config';
import { enrichCatalogAssistantReply } from '@nova-suite/shared';
import { getLlmProvider } from './providers';
import { buildSystemPrompt } from './prompts';
import { getToolsForPersona } from './tools/definitions';
import { executeTool } from './tools/executor';
import { enrichChatResultWithEmbeddedToolCalls, isLikelyRawToolOutput } from './tool-call-parse';
import type {
  AiChatMessage,
  AiConversationContext,
  AiPendingActionSummary,
  AiPersona,
} from './types';

export interface RunChatTurnParams {
  client: PoolClient;
  conversationId: string;
  userId: string;
  tenantId: string;
  persona: AiPersona;
  context?: AiConversationContext;
  userMessage: string;
  onToken?: (chunk: string) => void;
}

export interface RunChatTurnResult {
  assistantContent: string;
  pendingActions: AiPendingActionSummary[];
  usage?: { promptTokens?: number; completionTokens?: number };
}

async function loadHistory(client: PoolClient, conversationId: string): Promise<AiChatMessage[]> {
  const res = await client.query(
    `SELECT role, content
     FROM ai_messages
     WHERE conversation_id = $1 AND role IN ('user', 'assistant')
     ORDER BY created_at ASC
     LIMIT 40`,
    [conversationId],
  );
  return res.rows.map((row: { role: string; content: string }) => ({
    role: row.role as 'user' | 'assistant',
    content: row.content ?? '',
  }));
}

async function storeMessage(
  client: PoolClient,
  conversationId: string,
  role: string,
  content: string,
  toolCalls?: unknown,
): Promise<void> {
  await client.query(
    `INSERT INTO ai_messages (conversation_id, role, content, tool_calls)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [conversationId, role, content, toolCalls ? JSON.stringify(toolCalls) : null],
  );
}

async function storePendingAction(
  client: PoolClient,
  conversationId: string,
  actionType: string,
  payload: Record<string, unknown>,
  validationErrors?: string[],
): Promise<AiPendingActionSummary> {
  const ttlMin = config.ai.pendingActionTtlMinutes;
  const res = await client.query(
    `INSERT INTO ai_pending_actions (conversation_id, action_type, payload, validation_errors, expires_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, now() + ($5::text || ' minutes')::interval)
     RETURNING id, action_type, payload, validation_errors, expires_at`,
    [
      conversationId,
      actionType,
      JSON.stringify(payload),
      validationErrors?.length ? JSON.stringify(validationErrors) : null,
      String(ttlMin),
    ],
  );
  const row = res.rows[0];
  return {
    id: row.id,
    action_type: row.action_type,
    payload: row.payload,
    validation_errors: row.validation_errors ?? undefined,
    expires_at: row.expires_at,
  };
}

function finalizeAssistantReply(content: string, messages: AiChatMessage[]): string {
  return enrichCatalogAssistantReply(content, messages);
}

const CATALOG_REPLY_INSTRUCTION =
  'Answer in plain language. For each catalog item, include its path exactly as returned (starts with /catalog/). Never use raw UUIDs alone, external URLs (https://), or manual browse/search steps.';

const AGENT_REPLY_INSTRUCTION =
  'Answer in plain language using the incident data already loaded. Never output JSON or tool syntax, and never ask the user for an incident id.';

async function prefetchIncidentContext(
  messages: AiChatMessage[],
  ctx: {
    client: PoolClient;
    userId: string;
    tenantId: string;
    persona: AiPersona;
    context?: AiConversationContext;
  },
): Promise<void> {
  const incidentId = ctx.context?.incidentId;
  if (ctx.persona !== 'agent' || !incidentId) return;

  const tcId = `prefetch_incident_${Date.now()}`;
  const toolResult = await executeTool(
    {
      client: ctx.client,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      persona: ctx.persona,
      conversationContext: ctx.context,
    },
    'get_incident_context',
    { incident_id: incidentId },
  );

  messages.push({
    role: 'assistant',
    content: '',
    tool_calls: [{ id: tcId, name: 'get_incident_context', arguments: { incident_id: incidentId } }],
  });
  messages.push({
    role: 'tool',
    content: toolResult.content,
    tool_call_id: tcId,
    name: 'get_incident_context',
  });
}

function replyRecoveryInstruction(persona: AiPersona): string {
  return persona === 'ess'
    ? `Do not output JSON or tool syntax. ${CATALOG_REPLY_INSTRUCTION}`
    : `Do not output JSON or tool syntax. ${AGENT_REPLY_INSTRUCTION}`;
}

export async function runChatTurn(params: RunChatTurnParams): Promise<RunChatTurnResult> {
  const { client, conversationId, userId, tenantId, persona, context, userMessage, onToken } = params;
  const provider = getLlmProvider();
  const tools = getToolsForPersona(persona);

  await storeMessage(client, conversationId, 'user', userMessage);

  const messages: AiChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(persona, context) },
    ...(await loadHistory(client, conversationId)),
  ];

  await prefetchIncidentContext(messages, { client, userId, tenantId, persona, context });

  const pendingActions: AiPendingActionSummary[] = [];
  const totalUsage = { promptTokens: 0, completionTokens: 0 };
  let assistantContent = '';
  const allowedToolNames = new Set(tools.map((t) => t.name));

  for (let round = 0; round < config.ai.maxToolRounds; round++) {
    let result = enrichChatResultWithEmbeddedToolCalls(
      await provider.chat(messages, tools),
      tools,
      context,
    );
    if (result.usage?.promptTokens) totalUsage.promptTokens += result.usage.promptTokens;
    if (result.usage?.completionTokens) totalUsage.completionTokens += result.usage.completionTokens;

    if (!result.toolCalls.length) {
      if (isLikelyRawToolOutput(result.content, allowedToolNames)) {
        result = enrichChatResultWithEmbeddedToolCalls(result, tools, context);
      }
    }

    if (!result.toolCalls.length) {
      if (isLikelyRawToolOutput(result.content, allowedToolNames)) {
        messages.push({ role: 'assistant', content: result.content });
        messages.push({
          role: 'user',
          content: replyRecoveryInstruction(persona),
        });
        const recovered = await provider.chat(messages, []);
        assistantContent = finalizeAssistantReply(recovered.content, messages);
        if (onToken && assistantContent) onToken(assistantContent);
        await storeMessage(client, conversationId, 'assistant', assistantContent);
        break;
      }

      assistantContent = finalizeAssistantReply(result.content, messages);
      if (onToken && assistantContent) {
        for (const ch of assistantContent.match(/.{1,24}/gs) ?? [assistantContent]) {
          onToken(ch);
        }
      }
      await storeMessage(client, conversationId, 'assistant', assistantContent);
      break;
    }

    await storeMessage(
      client,
      conversationId,
      'assistant',
      result.content || '',
      result.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, arguments: tc.arguments })),
    );

    messages.push({
      role: 'assistant',
      content: result.content || '',
      tool_calls: result.toolCalls,
    });

    for (const tc of result.toolCalls) {
      const toolResult = await executeTool(
        { client, userId, tenantId, persona, conversationContext: context },
        tc.name,
        tc.arguments,
      );
      messages.push({
        role: 'tool',
        content: toolResult.content,
        tool_call_id: tc.id,
        name: tc.name,
      });
      await storeMessage(client, conversationId, 'tool', toolResult.content, {
        tool_call_id: tc.id,
        name: tc.name,
      });

      if (toolResult.propose) {
        pendingActions.push(
          await storePendingAction(
            client,
            conversationId,
            toolResult.propose.action_type,
            toolResult.propose.payload,
            toolResult.propose.validation_errors,
          ),
        );
      }
    }

    if (round === config.ai.maxToolRounds - 1) {
      let final = await provider.chat(messages, []);
      if (isLikelyRawToolOutput(final.content, allowedToolNames) || !final.content.trim()) {
        messages.push({
          role: 'user',
          content:
            persona === 'ess'
              ? `Summarize the tool results above for the user. ${CATALOG_REPLY_INSTRUCTION} Do not output JSON or tool call syntax.`
              : `Summarize the tool results above for the user. ${AGENT_REPLY_INSTRUCTION} Do not output JSON or tool call syntax.`,
        });
        final = await provider.chat(messages, []);
      }
      assistantContent = finalizeAssistantReply(final.content, messages);
      if (onToken && assistantContent) onToken(assistantContent);
      await storeMessage(client, conversationId, 'assistant', assistantContent);
    }
  }

  // After tool rounds, ensure we never return raw tool JSON to the client.
  if (
    assistantContent &&
    isLikelyRawToolOutput(assistantContent, allowedToolNames)
  ) {
    messages.push({
      role: 'user',
      content:
        persona === 'ess'
          ? `Reply to the user in plain language based on the information you already looked up. ${CATALOG_REPLY_INSTRUCTION} Do not output JSON.`
          : `Reply to the user in plain language based on the information you already looked up. ${AGENT_REPLY_INSTRUCTION} Do not output JSON.`,
    });
    const final = await provider.chat(messages, []);
    assistantContent = finalizeAssistantReply(final.content || assistantContent, messages);
    if (onToken && assistantContent) onToken(assistantContent);
  }

  return { assistantContent, pendingActions, usage: totalUsage };
}
