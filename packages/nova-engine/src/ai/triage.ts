/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { config } from '../config';
import { getLlmProvider, isAiProviderConfigured } from './providers';
import { loadTenantAiSettings } from './tenant-ai-settings';
import type { AiChatMessage } from './types';

export type ImpactUrgency = 'low' | 'medium' | 'high';

export interface TriageSuggestionPayload {
  suggested_category: string | null;
  suggested_impact: ImpactUrgency | null;
  suggested_urgency: ImpactUrgency | null;
  suggested_tags: string[];
  sentiment: string | null;
  confidence: number;
  raw_json: Record<string, unknown>;
}

const LEVELS: ImpactUrgency[] = ['low', 'medium', 'high'];

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function asLevel(value: unknown): ImpactUrgency | null {
  if (typeof value !== 'string') return null;
  const v = value.toLowerCase().trim() as ImpactUrgency;
  return LEVELS.includes(v) ? v : null;
}

function heuristicTriage(title: string, description: string | null): TriageSuggestionPayload {
  const text = `${title}\n${description ?? ''}`.toLowerCase();
  const tags: string[] = [];
  let category: string | null = null;
  let impact: ImpactUrgency = 'medium';
  let urgency: ImpactUrgency = 'medium';
  let sentiment = 'neutral';
  let confidence = 0.45;

  if (/\b(outage|down|unavailable|production|all users|critical)\b/.test(text)) {
    impact = 'high';
    urgency = 'high';
    category = 'Availability';
    tags.push('outage');
    confidence = 0.7;
  } else if (/\b(password|reset|login|mfa|sso|access)\b/.test(text)) {
    category = 'Access';
    impact = 'low';
    urgency = 'medium';
    tags.push('access');
    confidence = 0.6;
  } else if (/\b(email|outlook|mailbox|smtp)\b/.test(text)) {
    category = 'Email';
    tags.push('email');
    confidence = 0.55;
  } else if (/\b(network|vpn|wifi|dns|latency)\b/.test(text)) {
    category = 'Network';
    tags.push('network');
    confidence = 0.55;
  } else if (/\b(laptop|hardware|printer|monitor)\b/.test(text)) {
    category = 'Hardware';
    tags.push('hardware');
    confidence = 0.5;
  }

  if (/\b(urgent|asap|immediately|blocked|cannot work)\b/.test(text)) {
    urgency = urgency === 'high' ? 'high' : urgency === 'medium' ? 'high' : 'medium';
    confidence = Math.min(1, confidence + 0.1);
  }
  if (/\b(angry|frustrated|unacceptable|terrible)\b/.test(text)) {
    sentiment = 'negative';
  } else if (/\b(thanks|please|appreciate)\b/.test(text)) {
    sentiment = 'positive';
  }

  return {
    suggested_category: category,
    suggested_impact: impact,
    suggested_urgency: urgency,
    suggested_tags: tags,
    sentiment,
    confidence,
    raw_json: { source: 'heuristic' },
  };
}

function parseLlmJson(content: string): TriageSuggestionPayload | null {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter((t): t is string => typeof t === 'string').slice(0, 12)
      : [];
    return {
      suggested_category: typeof parsed.category === 'string' ? parsed.category.slice(0, 120) : null,
      suggested_impact: asLevel(parsed.impact),
      suggested_urgency: asLevel(parsed.urgency),
      suggested_tags: tags,
      sentiment: typeof parsed.sentiment === 'string' ? parsed.sentiment.slice(0, 40) : null,
      confidence: clampConfidence(Number(parsed.confidence ?? 0.6)),
      raw_json: { source: 'llm', ...parsed },
    };
  } catch {
    return null;
  }
}

async function generateTriageSuggestion(
  title: string,
  description: string | null,
): Promise<TriageSuggestionPayload> {
  const fallback = heuristicTriage(title, description);
  if (!config.ai.enabled || !isAiProviderConfigured()) {
    return fallback;
  }

  try {
    const provider = getLlmProvider();
    const messages: AiChatMessage[] = [
      {
        role: 'system',
        content:
          'You are an ITSM triage assistant. Respond with JSON only: '
          + '{"category":string|null,"impact":"low"|"medium"|"high","urgency":"low"|"medium"|"high",'
          + '"tags":string[],"sentiment":"positive"|"neutral"|"negative","confidence":0-1}. '
          + 'Impact = business blast radius. Urgency = time sensitivity.',
      },
      {
        role: 'user',
        content: `Title: ${title}\nDescription: ${description ?? '(none)'}`,
      },
    ];
    const result = await provider.chat(messages);
    return parseLlmJson(result.content) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function storeTriageSuggestion(
  client: PoolClient,
  params: {
    incidentId: string;
    tenantId: string;
    suggestion: TriageSuggestionPayload;
  },
): Promise<string> {
  const res = await client.query(
    `INSERT INTO incident_ai_suggestions (
       incident_id, tenant_id, suggested_category, suggested_impact, suggested_urgency,
       suggested_tags, sentiment, confidence, raw_json, status
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'pending'
     ) RETURNING id`,
    [
      params.incidentId,
      params.tenantId,
      params.suggestion.suggested_category,
      params.suggestion.suggested_impact,
      params.suggestion.suggested_urgency,
      params.suggestion.suggested_tags,
      params.suggestion.sentiment,
      params.suggestion.confidence,
      JSON.stringify(params.suggestion.raw_json),
    ],
  );
  return String(res.rows[0].id);
}

async function maybeAutoApplyPriority(
  client: PoolClient,
  incidentId: string,
  suggestion: TriageSuggestionPayload,
  actorUserId: string,
): Promise<void> {
  if (!suggestion.suggested_impact || !suggestion.suggested_urgency) return;

  const priorityResult = await client.query(
    'SELECT calculate_priority($1, $2) AS priority',
    [suggestion.suggested_impact, suggestion.suggested_urgency],
  );
  const priority = priorityResult.rows[0]?.priority;
  if (!priority) return;

  await client.query(
    `UPDATE incidents
     SET impact = $2, urgency = $3, priority = $4
     WHERE id = $1`,
    [incidentId, suggestion.suggested_impact, suggestion.suggested_urgency, priority],
  );
  await client.query(
    `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
     VALUES (current_tenant_id(), $1, $2, 'state_change', $3)`,
    [
      incidentId,
      actorUserId,
      `AI auto-applied impact=${suggestion.suggested_impact}, urgency=${suggestion.suggested_urgency}, priority=${priority}`,
    ],
  );
}

/**
 * Run triage for a newly created incident (intended fire-and-forget).
 * Stores a pending suggestion; auto-applies impact/urgency only when tenant flag is set.
 */
export async function runIncidentTriageJob(params: {
  client: PoolClient;
  incidentId: string;
  tenantId: string;
  actorUserId: string;
  title: string;
  description: string | null;
}): Promise<{ suggestionId: string | null; applied: boolean }> {
  const settings = await loadTenantAiSettings(params.client);
  if (!settings.ai_triage_on_create) {
    return { suggestionId: null, applied: false };
  }

  const suggestion = await generateTriageSuggestion(params.title, params.description);
  const suggestionId = await storeTriageSuggestion(params.client, {
    incidentId: params.incidentId,
    tenantId: params.tenantId,
    suggestion,
  });

  let applied = false;
  if (settings.ai_auto_apply_priority) {
    await maybeAutoApplyPriority(params.client, params.incidentId, suggestion, params.actorUserId);
    applied = true;
    await params.client.query(
      `UPDATE incident_ai_suggestions SET status = 'accepted' WHERE id = $1`,
      [suggestionId],
    );
  }

  return { suggestionId, applied };
}
