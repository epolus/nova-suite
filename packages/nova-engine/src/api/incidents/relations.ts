/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Incident relation services ───
// Similar incidents, CI links, known errors, correlations, problem links,
// major-incident link, and AI triage suggestions.
// Plain-argument services (PoolClient + args). No Request/Response.
import type { PoolClient } from 'pg';
import { AppError, NotFound } from '../../middleware/errorHandler';
import { suggestActiveKnownErrors } from '../../domain/known-errors';
import { correlateAlerts } from '../../ai/rca-correlation';
import { storedAlertAdapter } from '../../domain/event-correlation';
import { endUserIncidentVisibilityCondition } from './sla-helpers';
import {
  FORBIDDEN_INSUFFICIENT,
  type IncidentActor,
  type IncidentServiceResult,
} from './types';

export function optionalUuid(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    throw new AppError(400, 'Invalid identifier');
  }
  return text;
}

// ─── GET /api/incidents/:id/similar ───

export async function getSimilarIncidents(
  client: PoolClient,
  actor: IncidentActor,
  incidentId: string,
  limit: number,
): Promise<IncidentServiceResult<{ incidents: unknown[] }>> {
  const currentResult = await client.query(
    `SELECT i.id, i.caller_id
         FROM incidents i
         WHERE i.id = $1`,
    [incidentId],
  );
  if (currentResult.rows.length === 0) {
    throw NotFound('Incident not found');
  }

  const current = currentResult.rows[0];
  const isFulfiller = actor.isFulfiller;
  if (!isFulfiller && current.caller_id !== actor.id) {
    const submitterResult = await client.query(
      `SELECT 1
           FROM incident_journal j
           WHERE j.incident_id = $1
             AND j.author_id = $2
             AND j.entry_type = 'state_change'
             AND j.content LIKE 'Incident created with priority%'
           LIMIT 1`,
      [incidentId, actor.id],
    );
    if (submitterResult.rows.length === 0) {
      return FORBIDDEN_INSUFFICIENT;
    }
  }

  const visibilityClause = isFulfiller ? '' : `AND ${endUserIncidentVisibilityCondition('$2')}`;
  const params: unknown[] = isFulfiller ? [incidentId, limit] : [incidentId, actor.id, limit];
  const limitIdx = isFulfiller ? 2 : 3;

  const similarResult = await client.query(
    `WITH base AS (
           SELECT
             i.id,
             i.category,
             i.subcategory,
             i.service_id,
             i.configuration_item_id,
             COALESCE(i.title, '') AS title,
             COALESCE(i.description, '') AS description
           FROM incidents i
           WHERE i.id = $1::uuid
         ),
         ranked AS (
           SELECT
             i.id,
             i.number,
             i.title,
             i.status,
             i.priority,
             i.category,
             i.subcategory,
             i.service_id,
             s.name AS service_name,
             i.configuration_item_id,
             ci.name AS ci_name,
             ci.display_name AS ci_display_name,
             i.updated_at,
             i.created_at,
             (
               CASE
                 WHEN b.configuration_item_id IS NOT NULL AND i.configuration_item_id = b.configuration_item_id THEN 40
                 ELSE 0
               END
               + CASE
                 WHEN b.service_id IS NOT NULL AND i.service_id = b.service_id THEN 24
                 ELSE 0
               END
               + CASE
                 WHEN b.category IS NOT NULL AND b.category <> '' AND i.category = b.category THEN 14
                 ELSE 0
               END
               + CASE
                 WHEN b.subcategory IS NOT NULL AND b.subcategory <> '' AND i.subcategory = b.subcategory THEN 10
                 ELSE 0
               END
               + LEAST(
                 (
                   SELECT COUNT(*)::int
                   FROM (
                     SELECT DISTINCT lower(word) AS word
                     FROM unnest(regexp_split_to_array(b.title, E'\\W+')) AS word
                     WHERE length(word) >= 3
                   ) bw
                   JOIN (
                     SELECT DISTINCT lower(word) AS word
                     FROM unnest(regexp_split_to_array(COALESCE(i.title, ''), E'\\W+')) AS word
                     WHERE length(word) >= 3
                   ) iw ON iw.word = bw.word
                 ),
                 8
               )
               + LEAST(
                 (
                   SELECT COUNT(*)::int
                   FROM (
                     SELECT DISTINCT lower(word) AS word
                     FROM unnest(regexp_split_to_array(b.description, E'\\W+')) AS word
                     WHERE length(word) >= 4
                   ) bw
                   JOIN (
                     SELECT DISTINCT lower(word) AS word
                     FROM unnest(regexp_split_to_array(COALESCE(i.description, ''), E'\\W+')) AS word
                     WHERE length(word) >= 4
                   ) iw ON iw.word = bw.word
                 ),
                 6
               )
             )::int AS similarity_score
           FROM incidents i
           CROSS JOIN base b
           LEFT JOIN services s ON s.id = i.service_id
           LEFT JOIN configuration_items ci ON ci.id = i.configuration_item_id
           WHERE i.id <> b.id
           ${visibilityClause}
         )
         SELECT *
         FROM ranked
         WHERE similarity_score > 0
         ORDER BY similarity_score DESC, updated_at DESC
         LIMIT $${limitIdx}`,
    params,
  );

  return { ok: true, data: { incidents: similarResult.rows } };
}

// ─── GET /api/incidents/similar-by-text ───

export async function getSimilarByText(
  client: PoolClient,
  actor: IncidentActor,
  opts: { title: string; description: string; limit: number },
): Promise<unknown[]> {
  const { title, description, limit } = opts;
  const isFulfiller = actor.isFulfiller;

  const visibilityClause = isFulfiller ? '' : 'AND i.caller_id = $3::uuid';
  const params: unknown[] = isFulfiller ? [title, description, limit] : [title, description, actor.id, limit];
  const limitIdx = isFulfiller ? 3 : 4;

  const result = await client.query(
    `WITH base AS (
         SELECT $1::text AS title, $2::text AS description
       ),
       ranked AS (
         SELECT
           i.id, i.number, i.title, i.status, i.priority,
           i.category, i.subcategory, i.service_id,
           s.name AS service_name, i.configuration_item_id,
           ci.name AS ci_name, ci.display_name AS ci_display_name,
           i.updated_at, i.created_at,
           (
             LEAST(
               (SELECT COUNT(*)::int FROM
                 (SELECT DISTINCT lower(word) AS word FROM unnest(regexp_split_to_array((SELECT title FROM base), E'\\W+')) AS word WHERE length(word) >= 3) bw
                 JOIN (SELECT DISTINCT lower(word) AS word FROM unnest(regexp_split_to_array(COALESCE(i.title, ''), E'\\W+')) AS word WHERE length(word) >= 3) iw ON iw.word = bw.word),
               8
             )
             + LEAST(
               (SELECT COUNT(*)::int FROM
                 (SELECT DISTINCT lower(word) AS word FROM unnest(regexp_split_to_array((SELECT description FROM base), E'\\W+')) AS word WHERE length(word) >= 4) bw
                 JOIN (SELECT DISTINCT lower(word) AS word FROM unnest(regexp_split_to_array(COALESCE(i.description, ''), E'\\W+')) AS word WHERE length(word) >= 4) iw ON iw.word = bw.word),
               6
             )
           )::int AS similarity_score
         FROM incidents i
         CROSS JOIN base b
         LEFT JOIN services s ON s.id = i.service_id
         LEFT JOIN configuration_items ci ON ci.id = i.configuration_item_id
         ${visibilityClause}
       )
       SELECT * FROM ranked
       WHERE similarity_score > 0
       ORDER BY similarity_score DESC, updated_at DESC
       LIMIT $${limitIdx}`,
    params,
  );

  return result.rows;
}

// ─── GET /api/incidents/by-ci/:ciId ───

export async function getIncidentsByCi(client: PoolClient, ciId: string): Promise<unknown[]> {
  const rows = await client.query(
    `SELECT id, number, title, status, priority, updated_at
       FROM incidents
       WHERE tenant_id = current_tenant_id()
         AND configuration_item_id = $1
       ORDER BY updated_at DESC`,
    [ciId],
  );
  return rows.rows;
}

// ─── GET /api/incidents/known-errors-by-context ───

export async function getKnownErrorsByContext(
  client: PoolClient,
  query: Record<string, unknown>,
): Promise<unknown[]> {
  return suggestActiveKnownErrors(
    client,
    optionalUuid(query.configuration_item_id),
    optionalUuid(query.service_id),
  );
}

// ─── GET /api/incidents/:id/correlations ───

export async function getCorrelations(client: PoolClient, incidentId: string): Promise<unknown[]> {
  const incident = await client.query(
    `SELECT id, title, description, configuration_item_id, service_id, created_at
       FROM incidents WHERE id = $1`,
    [incidentId],
  );
  const row = incident.rows[0] as {
    id: string;
    title: string;
    description: string | null;
    configuration_item_id: string | null;
    service_id: string | null;
    created_at: string;
  } | undefined;
  if (!row) throw NotFound('Incident not found');
  return correlateAlerts(row, storedAlertAdapter(client));
}

// ─── GET /api/incidents/:id/known-errors ───

export async function getIncidentKnownErrors(
  client: PoolClient,
  actor: IncidentActor,
  incidentId: string,
): Promise<IncidentServiceResult<unknown[]>> {
  const result = await client.query(
    `SELECT configuration_item_id, service_id, caller_id
       FROM incidents
       WHERE id = $1 AND tenant_id = current_tenant_id()`,
    [incidentId],
  );
  if (result.rows.length === 0) throw NotFound('Incident not found');
  const incident = result.rows[0];
  if (!actor.isFulfiller && incident.caller_id !== actor.id) {
    return FORBIDDEN_INSUFFICIENT;
  }
  const knownErrors = await suggestActiveKnownErrors(
    client,
    incident.configuration_item_id,
    incident.service_id,
  );
  return { ok: true, data: knownErrors };
}

// ─── POST /api/incidents/:id/link-major-incident ───

export async function linkMajorIncident(
  client: PoolClient,
  actor: IncidentActor,
  incidentId: string,
  majorIncidentId: string,
): Promise<IncidentServiceResult<{ success: true; major_incident_id: string }>> {
  const tenantId = actor.tenant_id;
  const userId = actor.id;

  const inc = await client.query(
    `SELECT id, caller_id FROM incidents WHERE id = $1 AND tenant_id = current_tenant_id()`,
    [incidentId],
  );
  if (inc.rows.length === 0) throw NotFound('Incident not found');
  if (!actor.isFulfiller && (inc.rows[0] as { caller_id: string | null }).caller_id !== userId) {
    return FORBIDDEN_INSUFFICIENT;
  }

  const mi = await client.query(
    `SELECT id, number, status::text AS status, title FROM major_incidents WHERE id = $1 AND tenant_id = $2`,
    [majorIncidentId, tenantId],
  );
  if (mi.rows.length === 0) throw NotFound('Major incident not found');
  const mst = (mi.rows[0] as { status: string }).status;
  if (['pending_acceptance', 'resolved', 'cancelled'].includes(mst)) {
    return {
      ok: false,
      status: 400,
      error: 'This major incident cannot accept new links (pending acceptance, resolved, or cancelled).',
    };
  }

  await client.query(
    `INSERT INTO major_incident_related_incidents (tenant_id, major_incident_id, incident_id, link_reason)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (major_incident_id, incident_id) DO UPDATE SET link_reason = EXCLUDED.link_reason
         RETURNING *`,
    [tenantId, majorIncidentId, incidentId, 'Linked from incident record'],
  );

  await client.query(
    `INSERT INTO major_incident_events (tenant_id, major_incident_id, event_type, payload, actor_user_id)
         VALUES ($1, $2, 'related_incident_linked', $3::jsonb, $4)`,
    [tenantId, majorIncidentId, JSON.stringify({ incident_id: incidentId }), userId],
  );

  const miTitle = (mi.rows[0] as { title: string }).title;
  await client.query(
    `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content, is_customer_visible)
         VALUES (current_tenant_id(), $1::uuid, $2::uuid, 'work_note', $3, false)`,
    [incidentId, userId, `Linked to major incident: ${miTitle}`],
  );

  return { ok: true, data: { success: true, major_incident_id: majorIncidentId } };
}

// ─── AI suggestions ───

export async function listAiSuggestions(client: PoolClient, incidentId: string): Promise<unknown[]> {
  const incident = await client.query(`SELECT id FROM incidents WHERE id = $1`, [incidentId]);
  if (incident.rows.length === 0) throw NotFound('Incident not found');

  const result = await client.query(
    `SELECT id, incident_id, tenant_id, suggested_category, suggested_impact, suggested_urgency,
                suggested_tags, sentiment, confidence, raw_json, status, created_at
         FROM incident_ai_suggestions
         WHERE incident_id = $1 AND tenant_id = current_tenant_id()
         ORDER BY created_at DESC`,
    [incidentId],
  );
  return result.rows;
}

export async function acceptAiSuggestion(
  client: PoolClient,
  actor: IncidentActor,
  incidentId: string,
  suggestionId: string,
): Promise<{ suggestion_id: string; status: 'accepted'; incident: unknown }> {
  const sug = await client.query(
    `SELECT * FROM incident_ai_suggestions
         WHERE id = $1 AND incident_id = $2 AND tenant_id = current_tenant_id()`,
    [suggestionId, incidentId],
  );
  if (sug.rows.length === 0) throw NotFound('Suggestion not found');
  const suggestion = sug.rows[0] as {
    status: string;
    suggested_category: string | null;
    suggested_impact: string | null;
    suggested_urgency: string | null;
    suggested_tags: string[] | null;
  };
  if (suggestion.status !== 'pending') {
    throw new AppError(400, `Suggestion is already ${suggestion.status}`);
  }

  const updates: Record<string, unknown> = {};
  if (suggestion.suggested_category) updates.category = suggestion.suggested_category;
  if (suggestion.suggested_impact) updates.impact = suggestion.suggested_impact;
  if (suggestion.suggested_urgency) updates.urgency = suggestion.suggested_urgency;

  if (suggestion.suggested_impact || suggestion.suggested_urgency) {
    const existing = await client.query(
      `SELECT impact, urgency FROM incidents WHERE id = $1`,
      [incidentId],
    );
    const impact = suggestion.suggested_impact || existing.rows[0]?.impact;
    const urgency = suggestion.suggested_urgency || existing.rows[0]?.urgency;
    const priorityResult = await client.query(
      'SELECT calculate_priority($1, $2) AS priority',
      [impact, urgency],
    );
    updates.priority = priorityResult.rows[0]?.priority;
  }

  if (Object.keys(updates).length > 0) {
    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
    await client.query(
      `UPDATE incidents SET ${setClauses.join(', ')} WHERE id = $1`,
      [incidentId, ...Object.values(updates)],
    );
  }

  await client.query(
    `UPDATE incident_ai_suggestions SET status = 'accepted' WHERE id = $1`,
    [suggestionId],
  );
  await client.query(
    `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
         VALUES (current_tenant_id(), $1, $2, 'state_change', $3)`,
    [incidentId, actor.id, 'Accepted AI triage suggestion'],
  );

  const incident = await client.query(`SELECT * FROM incidents WHERE id = $1`, [incidentId]);
  return { suggestion_id: suggestionId, status: 'accepted', incident: incident.rows[0] };
}

export async function rejectAiSuggestion(
  client: PoolClient,
  actor: IncidentActor,
  incidentId: string,
  suggestionId: string,
): Promise<{ suggestion_id: string; status: 'rejected' }> {
  const sug = await client.query(
    `SELECT id, status FROM incident_ai_suggestions
         WHERE id = $1 AND incident_id = $2 AND tenant_id = current_tenant_id()`,
    [suggestionId, incidentId],
  );
  if (sug.rows.length === 0) throw NotFound('Suggestion not found');
  if (sug.rows[0].status !== 'pending') {
    throw new AppError(400, `Suggestion is already ${sug.rows[0].status}`);
  }

  await client.query(
    `UPDATE incident_ai_suggestions SET status = 'rejected' WHERE id = $1`,
    [suggestionId],
  );
  await client.query(
    `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
         VALUES (current_tenant_id(), $1, $2, 'work_note', $3)`,
    [incidentId, actor.id, 'Rejected AI triage suggestion'],
  );

  return { suggestion_id: suggestionId, status: 'rejected' };
}

// ─── Problem links ───

export async function getIncidentProblems(
  client: PoolClient,
  actor: IncidentActor,
  incidentId: string,
): Promise<IncidentServiceResult<unknown[]>> {
  const incident = await client.query(
    `SELECT id, caller_id FROM incidents WHERE id = $1`,
    [incidentId],
  );
  if (incident.rows.length === 0) throw NotFound('Incident not found');

  if (!actor.isFulfiller && incident.rows[0].caller_id !== actor.id) {
    return FORBIDDEN_INSUFFICIENT;
  }

  const result = await client.query(
    `SELECT
         pi.problem_id,
         pi.incident_id,
         pi.relationship_type,
         pi.created_at,
         p.number AS problem_number,
         p.title AS problem_title,
         p.status AS problem_status,
         p.priority AS problem_priority
       FROM problem_incidents pi
       JOIN problems p ON p.id = pi.problem_id
       WHERE pi.incident_id = $1
         AND pi.tenant_id = current_tenant_id()
       ORDER BY pi.created_at DESC`,
    [incidentId],
  );
  return { ok: true, data: result.rows };
}

export async function linkProblem(
  client: PoolClient,
  incidentId: string,
  problemId: string,
  relationshipType?: string | null,
): Promise<void> {
  const incident = await client.query(`SELECT id FROM incidents WHERE id = $1`, [incidentId]);
  if (incident.rows.length === 0) throw NotFound('Incident not found');
  const problem = await client.query(`SELECT id FROM problems WHERE id = $1`, [problemId]);
  if (problem.rows.length === 0) throw NotFound('Problem not found');

  await client.query(
    `INSERT INTO problem_incidents (tenant_id, problem_id, incident_id, relationship_type)
         VALUES (current_tenant_id(), $1, $2, $3)
         ON CONFLICT (tenant_id, problem_id, incident_id) DO UPDATE
         SET relationship_type = EXCLUDED.relationship_type`,
    [problemId, incidentId, relationshipType || 'related_to'],
  );
}

export async function unlinkProblem(
  client: PoolClient,
  incidentId: string,
  problemId: string,
): Promise<void> {
  await client.query(
    `DELETE FROM problem_incidents
         WHERE tenant_id = current_tenant_id()
           AND incident_id = $1
           AND problem_id = $2`,
    [incidentId, problemId],
  );
}
