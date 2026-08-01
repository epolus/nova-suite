/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { validateAutomationConfig } from '@nova-suite/shared';
import { createIncidentSchema } from '../../domain/schemas';
import {
  getCatalogItemDetail,
  listCatalogCategories,
  searchCatalogItems,
} from '../catalog-search';
import {
  getPublishedArticleSummary,
  searchKnowledgeByText,
  suggestKbForIncident,
} from '../knowledge-search';
import type { AiConversationContext, AiPersona, AiPendingActionType } from '../types';
import { PROPOSE_TOOL_NAMES } from './definitions';

const CATALOG_ORDERING_HINT =
  'Tell the user to open each item path (starts with /catalog/) to configure and order. Copy path verbatim in your reply; never use external URLs or raw ids alone.';

export interface ToolExecutionContext {
  client: PoolClient;
  userId: string;
  tenantId: string;
  persona: AiPersona;
  conversationContext?: AiConversationContext;
}

export interface ToolResult {
  content: string;
  propose?: {
    action_type: AiPendingActionType;
    payload: Record<string, unknown>;
    validation_errors?: string[];
  };
}

export async function executeTool(
  ctx: ToolExecutionContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  if (PROPOSE_TOOL_NAMES.has(name)) {
    return executeProposeTool(ctx, name, args);
  }

  switch (name) {
    case 'search_knowledge': {
      const query = String(args.query ?? '').trim();
      const category = args.category ? String(args.category) : '';
      const hits = await searchKnowledgeByText(ctx.client, {
        title: query,
        description: query,
        category,
        limit: 8,
      });
      if (hits.length === 0) {
        return { content: JSON.stringify({ articles: [], message: 'No matching articles found.' }) };
      }
      return { content: JSON.stringify({ articles: hits }) };
    }
    case 'get_article_summary': {
      const articleId = String(args.article_id ?? '');
      const article = await getPublishedArticleSummary(ctx.client, articleId);
      if (!article) return { content: JSON.stringify({ error: 'Article not found or not published' }) };
      return { content: JSON.stringify(article) };
    }
    case 'list_catalog_categories': {
      const categories = await listCatalogCategories(ctx.client);
      return { content: JSON.stringify({ categories }) };
    }
    case 'search_catalog': {
      const query = String(args.query ?? '').trim();
      if (!query) {
        return { content: JSON.stringify({ error: 'query is required' }) };
      }
      const items = await searchCatalogItems(ctx.client, {
        query,
        category: args.category ? String(args.category) : undefined,
        limit: Number(args.limit ?? 8),
      });
      if (items.length === 0) {
        return {
          content: JSON.stringify({
            items: [],
            message: 'No catalog items matched. Try list_catalog_categories or a broader query.',
          }),
        };
      }
      return { content: JSON.stringify({ items, ordering: CATALOG_ORDERING_HINT }) };
    }
    case 'get_catalog_item': {
      const itemId = String(args.item_id ?? '');
      const item = await getCatalogItemDetail(ctx.client, itemId);
      if (!item) {
        return { content: JSON.stringify({ error: 'Catalog item not found or not available' }) };
      }
      return { content: JSON.stringify({ item, ordering: CATALOG_ORDERING_HINT }) };
    }
    case 'search_my_incidents': {
      const status = args.status === 'all' ? 'all' : 'open';
      const limit = Math.min(Number(args.limit ?? 5), 20);
      const condition =
        status === 'open'
          ? `status NOT IN ('closed', 'cancelled')`
          : 'TRUE';
      const res = await ctx.client.query(
        `SELECT id, number, title, status, priority, created_at
         FROM incidents
         WHERE caller_id = $1 AND ${condition}
         ORDER BY created_at DESC
         LIMIT $2`,
        [ctx.userId, limit],
      );
      return { content: JSON.stringify({ incidents: res.rows }) };
    }
    case 'get_incident_context': {
      const incidentId =
        String(args.incident_id ?? ctx.conversationContext?.incidentId ?? '');
      if (!incidentId) {
        return { content: JSON.stringify({ error: 'incident_id is required' }) };
      }
      const inc = await ctx.client.query(
        `SELECT id, number, title, description, status, priority, impact, urgency,
                category, subcategory, caller_id, assigned_to, assignment_group_id, created_at
         FROM incidents WHERE id = $1`,
        [incidentId],
      );
      if (inc.rows.length === 0) {
        return { content: JSON.stringify({ error: 'Incident not found' }) };
      }
      const journal = await ctx.client.query(
        `SELECT j.entry_type, j.content, j.is_customer_visible, j.created_at, u.display_name AS author_name
         FROM incident_journal j
         LEFT JOIN users u ON u.id = j.author_id
         WHERE j.incident_id = $1
         ORDER BY j.created_at DESC
         LIMIT 25`,
        [incidentId],
      );
      const entries = ctx.persona === 'ess'
        ? journal.rows.filter((e: { is_customer_visible: boolean }) => e.is_customer_visible)
        : journal.rows;
      return {
        content: JSON.stringify({ incident: inc.rows[0], journal: entries }),
      };
    }
    case 'suggest_kb_for_incident': {
      const incidentId =
        String(args.incident_id ?? ctx.conversationContext?.incidentId ?? '');
      if (!incidentId) {
        return { content: JSON.stringify({ error: 'incident_id is required' }) };
      }
      const hits = await suggestKbForIncident(ctx.client, incidentId, 8);
      return { content: JSON.stringify({ articles: hits }) };
    }
    default:
      return { content: JSON.stringify({ error: `Unknown tool: ${name}` }) };
  }
}

async function executeProposeTool(
  ctx: ToolExecutionContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case 'propose_create_incident': {
      const payload = {
        title: String(args.title ?? ''),
        description: String(args.description ?? ''),
        impact: args.impact ?? 'medium',
        urgency: args.urgency ?? 'medium',
      };
      const parsed = createIncidentSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          content: JSON.stringify({ error: 'Invalid incident draft', details: parsed.error.issues }),
        };
      }
      return {
        content: JSON.stringify({
          status: 'pending_confirmation',
          message: 'Incident draft ready for user confirmation.',
          preview: parsed.data,
        }),
        propose: {
          action_type: 'propose_create_incident',
          payload: parsed.data as unknown as Record<string, unknown>,
        },
      };
    }
    case 'propose_work_note': {
      const incidentId =
        String(args.incident_id ?? ctx.conversationContext?.incidentId ?? '');
      const content = String(args.content ?? '').trim();
      if (!incidentId || !content) {
        return { content: JSON.stringify({ error: 'incident_id and content are required' }) };
      }
      const payload = {
        incident_id: incidentId,
        entry_type: args.entry_type === 'work_note' ? 'work_note' : 'comment',
        content,
        is_customer_visible: args.is_customer_visible !== false,
      };
      return {
        content: JSON.stringify({ status: 'pending_confirmation', preview: payload }),
        propose: { action_type: 'propose_work_note', payload },
      };
    }
    case 'propose_automation_config': {
      const automationConfig = args.automation_config;
      const errors = validateAutomationConfig(automationConfig);
      const payload = {
        automation_config: automationConfig,
        summary: args.summary ? String(args.summary) : '',
        catalog_task_id: ctx.conversationContext?.catalogTaskId ?? null,
      };
      return {
        content: JSON.stringify({
          status: 'pending_confirmation',
          validation_errors: errors,
          preview: payload,
        }),
        propose: {
          action_type: 'propose_automation_config',
          payload: payload as Record<string, unknown>,
          validation_errors: errors.length > 0 ? errors : undefined,
        },
      };
    }
    default:
      return { content: JSON.stringify({ error: `Unknown propose tool: ${name}` }) };
  }
}
