/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  authenticate,
  getRequestClient,
  releaseTenantClient,
  setTenantRLS,
} from '../../middleware/auth';
import { uuidSchema } from '../../domain/schemas';
import { validateBody } from '../../middleware/validate';
import { AppError, Forbidden, NotFound } from '../../middleware/errorHandler';
import { config } from '../../config';
import { isAiProviderConfigured } from '../../ai/providers';
import { isFulfillerRole } from '../roles';
import { confirmPendingAction } from '../../ai/actions';
import { friendlyLlmErrorFromUnknown } from '../../ai/llm-errors';
import { runChatTurn } from '../../ai/orchestrator';
import type { AiConversationContext, AiPersona } from '../../ai/types';

const router = Router();

const aiMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.ai.rateLimitPerUserPerMin,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
  message: { error: 'AI rate limit exceeded. Please retry in a minute.' },
});

/** Starting a thread is cheap; keep separate from chat turns so opening the panel is not starved. */
const aiCreateConversationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.user?.id ?? req.ip ?? 'anonymous'}:create`,
  message: { error: 'Too many new assistant sessions. Please wait a moment.' },
});

const aiConversationContextSchema = z.object({
  incidentId: uuidSchema.optional(),
  catalogTaskId: uuidSchema.optional(),
  serviceItemId: uuidSchema.optional(),
});

const createConversationSchema = z.object({
  persona: z.enum(['ess', 'agent']),
  context: aiConversationContextSchema.optional(),
});

const conversationContextSchema = aiConversationContextSchema.optional();

const sendMessageSchema = z.object({
  content: z.string().min(1).max(8000),
  stream: z.boolean().optional(),
  context: conversationContextSchema,
});

function requireAiEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (!config.ai.enabled) {
    res.status(503).json({ error: 'AI assistant is not enabled' });
    return;
  }
  if (!isAiProviderConfigured()) {
    res.status(503).json({ error: 'AI provider is not configured' });
    return;
  }
  next();
}

function assertPersonaAccess(req: Request, persona: AiPersona): void {
  if (persona === 'ess') {
    if (!config.ai.essEnabled) throw Forbidden('ESS AI assistant is disabled');
    if (isFulfillerRole(req)) {
      throw Forbidden('Use agent AI assistant from the fulfiller workspace');
    }
    return;
  }
  if (!config.ai.agentEnabled) throw Forbidden('Agent AI assistant is disabled');
  if (!isFulfillerRole(req)) throw Forbidden('Agent AI requires fulfiller or admin role');
}

async function getOwnedConversation(client: Awaited<ReturnType<typeof getRequestClient>>, id: string, userId: string) {
  const res = await client.query(
    `SELECT id, tenant_id, user_id, persona, context, created_at
     FROM ai_conversations
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if (res.rows.length === 0) throw NotFound('Conversation not found');
  return res.rows[0] as {
    id: string;
    tenant_id: string;
    user_id: string;
    persona: AiPersona;
    context: AiConversationContext;
    created_at: string;
  };
}

router.use(authenticate);

router.get('/status', (_req, res) => {
  res.json({
    enabled: config.ai.enabled,
    ess_enabled: config.ai.essEnabled,
    agent_enabled: config.ai.agentEnabled,
    provider_configured: isAiProviderConfigured(),
    default_provider: config.ai.defaultProvider,
  });
});

router.use(setTenantRLS, releaseTenantClient, requireAiEnabled);

router.post(
  '/conversations',
  aiCreateConversationLimiter,
  validateBody(createConversationSchema),
  async (req, res, next) => {
    try {
      const client = getRequestClient(req);
      const { persona, context } = req.body as z.infer<typeof createConversationSchema>;
      assertPersonaAccess(req, persona);

      const result = await client.query(
        `INSERT INTO ai_conversations (tenant_id, user_id, persona, context)
         VALUES (current_tenant_id(), $1, $2, $3::jsonb)
         RETURNING id, persona, context, created_at`,
        [req.user!.id, persona, JSON.stringify(context ?? {})],
      );
      res.status(201).json({ conversation: result.rows[0] });
    } catch (err) {
      next(err);
    }
  },
);

router.use(aiMessageLimiter);

router.get('/conversations/:id', async (req, res, next) => {
  try {
    const client = getRequestClient(req);
    const conversation = await getOwnedConversation(client, String(req.params.id), req.user!.id);

    const messages = await client.query(
      `SELECT id, role, content, tool_calls, created_at
       FROM ai_messages
       WHERE conversation_id = $1 AND role IN ('user', 'assistant')
       ORDER BY created_at ASC`,
      [conversation.id],
    );

    const pending = await client.query(
      `SELECT id, action_type, payload, validation_errors, status, expires_at, created_at
       FROM ai_pending_actions
       WHERE conversation_id = $1 AND status = 'pending' AND expires_at > now()
       ORDER BY created_at ASC`,
      [conversation.id],
    );

    res.json({
      conversation,
      messages: messages.rows,
      pending_actions: pending.rows,
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/conversations/:id/messages',
  validateBody(sendMessageSchema),
  async (req, res, next) => {
    try {
      const client = getRequestClient(req);
      const conversation = await getOwnedConversation(client, String(req.params.id), req.user!.id);
      assertPersonaAccess(req, conversation.persona);

      const { content, stream, context: requestContext } = req.body as z.infer<typeof sendMessageSchema>;
      const effectiveContext = {
        ...(conversation.context ?? {}),
        ...(requestContext ?? {}),
      } as AiConversationContext;

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        const sendEvent = (event: string, data: unknown) => {
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        try {
          const result = await runChatTurn({
            client,
            conversationId: conversation.id,
            userId: req.user!.id,
            tenantId: req.user!.tenant_id,
            persona: conversation.persona,
            context: effectiveContext,
            userMessage: content,
            onToken: (chunk) => sendEvent('token', { content: chunk }),
          });

          sendEvent('done', {
            content: result.assistantContent,
            pending_actions: result.pendingActions,
            usage: result.usage,
          });
          res.end();
        } catch (err) {
          sendEvent('error', {
            error: friendlyLlmErrorFromUnknown(err),
          });
          res.end();
        }
        return;
      }

      const result = await runChatTurn({
        client,
        conversationId: conversation.id,
        userId: req.user!.id,
        tenantId: req.user!.tenant_id,
        persona: conversation.persona,
        context: effectiveContext,
        userMessage: content,
      });

      res.json({
        content: result.assistantContent,
        pending_actions: result.pendingActions,
        usage: result.usage,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/conversations/:id/actions/:actionId/confirm', async (req, res, next) => {
  try {
    const client = getRequestClient(req);
    const conversation = await getOwnedConversation(client, String(req.params.id), req.user!.id);
    assertPersonaAccess(req, conversation.persona);

    const actionRes = await client.query(
      `SELECT id, action_type, payload, validation_errors, status, expires_at
       FROM ai_pending_actions
       WHERE id = $1 AND conversation_id = $2`,
      [String(req.params.actionId), conversation.id],
    );
    if (actionRes.rows.length === 0) throw NotFound('Pending action not found');
    const action = actionRes.rows[0] as {
      id: string;
      action_type: string;
      payload: Record<string, unknown>;
      validation_errors: string[] | null;
      status: string;
      expires_at: string;
    };

    if (action.status !== 'pending') {
      throw new AppError(409, 'Action is no longer pending');
    }
    if (new Date(action.expires_at).getTime() < Date.now()) {
      await client.query(
        `UPDATE ai_pending_actions SET status = 'expired' WHERE id = $1`,
        [action.id],
      );
      throw new AppError(410, 'Pending action has expired');
    }

    if (
      action.action_type === 'propose_automation_config' &&
      Array.isArray(action.validation_errors) &&
      action.validation_errors.length > 0
    ) {
      throw new AppError(400, `Automation config is invalid: ${action.validation_errors.join('; ')}`);
    }

    const result = await confirmPendingAction(
      client,
      req.user!.id,
      req.user!.tenant_id,
      action.action_type as Parameters<typeof confirmPendingAction>[3],
      action.payload,
    );

    await client.query(
      `UPDATE ai_pending_actions SET status = 'confirmed', confirmed_at = now() WHERE id = $1`,
      [action.id],
    );

    const incidentRow = result.incident as { id?: string } | undefined;
    await client.query(
      `INSERT INTO ai_audit_log (tenant_id, user_id, conversation_id, action_type, entity_type, entity_id, metadata)
       VALUES (current_tenant_id(), $1, $2, $3, $4, $5, $6::jsonb)`,
      [
        req.user!.id,
        conversation.id,
        action.action_type,
        incidentRow?.id ? 'incident' : null,
        incidentRow?.id ?? null,
        JSON.stringify({ result_summary: Object.keys(result) }),
      ],
    );

    res.json({ result });
  } catch (err) {
    next(err);
  }
});

router.delete('/conversations/:id/actions/:actionId', async (req, res, next) => {
  try {
    const client = getRequestClient(req);
    const conversation = await getOwnedConversation(client, String(req.params.id), req.user!.id);

    const updated = await client.query(
      `UPDATE ai_pending_actions
       SET status = 'cancelled'
       WHERE id = $1 AND conversation_id = $2 AND status = 'pending'
       RETURNING id`,
      [String(req.params.actionId), conversation.id],
    );
    if (updated.rows.length === 0) throw NotFound('Pending action not found');
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
