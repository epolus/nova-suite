/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { searchKnowledgeByText, type KnowledgeSearchHit } from './knowledge-search';
import { loadTenantAiSettings } from './tenant-ai-settings';

export interface DeflectionProposal {
  article: KnowledgeSearchHit;
  confidence: number;
  autoResolved: boolean;
}

/** Map KB suggestion_score (~0–40+) into a 0–1 confidence. */
export function kbScoreToConfidence(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.max(0, Math.min(1, score / 20));
}

export async function evaluateEssDeflection(
  client: PoolClient,
  params: {
    incidentId: string;
    title: string;
    description: string | null;
    actorUserId: string;
  },
): Promise<DeflectionProposal | null> {
  const settings = await loadTenantAiSettings(client);
  const hits = await searchKnowledgeByText(client, {
    title: params.title,
    description: params.description ?? undefined,
    limit: 3,
  });
  const top = hits[0];
  if (!top) return null;

  const confidence = kbScoreToConfidence(top.suggestion_score);
  const proposal: DeflectionProposal = {
    article: top,
    confidence,
    autoResolved: false,
  };

  // Always surface a high-confidence proposal via journal when above threshold-ish.
  const proposeThreshold = Math.max(0.4, settings.ess_deflect_confidence_threshold * 0.75);
  if (confidence < proposeThreshold) {
    return null;
  }

  await client.query(
    `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content, is_customer_visible)
     VALUES (current_tenant_id(), $1, $2, 'comment', $3, true)`,
    [
      params.incidentId,
      params.actorUserId,
      `Suggested knowledge article for self-service: ${top.number} — ${top.title} (${top.path}). Confidence ${(confidence * 100).toFixed(0)}%.`,
    ],
  );

  if (
    settings.ess_auto_deflect
    && confidence >= settings.ess_deflect_confidence_threshold
  ) {
    await client.query(
      `INSERT INTO incident_kb_resolutions (incident_id, kb_id, resolved_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (incident_id, kb_id) DO NOTHING`,
      [params.incidentId, top.id, params.actorUserId],
    );

    const notes = `Auto-resolved via knowledge article ${top.number}: ${top.title}. See ${top.path}`;
    await client.query(
      `UPDATE incidents
       SET status = 'resolved',
           resolution_notes = COALESCE(NULLIF(resolution_notes, ''), $2),
           resolved_at = COALESCE(resolved_at, now())
       WHERE id = $1
         AND status NOT IN ('resolved', 'closed', 'cancelled')`,
      [params.incidentId, notes],
    );

    await client.query(
      `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content, is_customer_visible)
       VALUES (current_tenant_id(), $1, $2, 'state_change', $3, true)`,
      [
        params.incidentId,
        params.actorUserId,
        `ESS auto-deflected: resolved with KB ${top.number} (confidence ${(confidence * 100).toFixed(0)}%).`,
      ],
    );

    proposal.autoResolved = true;
  }

  return proposal;
}
