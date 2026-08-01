/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { config } from '../config';

export interface KnowledgeSearchHit {
  id: string;
  number: string;
  title: string;
  excerpt: string;
  category_name: string | null;
  suggestion_score: number;
  path: string;
}

export async function searchKnowledgeByText(
  client: PoolClient,
  params: { title?: string; description?: string; category?: string; limit?: number },
): Promise<KnowledgeSearchHit[]> {
  const limit = Math.min(params.limit ?? config.ai.maxContextArticles, 20);
  const title = params.title ?? '';
  const description = params.description ?? '';
  const category = params.category ?? '';

  const suggestions = await client.query(
    `WITH ranked AS (
       SELECT
         a.id, a.number, a.title,
         LEFT(COALESCE(a.content, ''), 260) AS excerpt,
         kc.name AS category_name,
         (
           CASE
             WHEN $3::text <> '' AND kc.name IS NOT NULL
                  AND (kc.name ILIKE $3 OR kc.name ILIKE ('%' || $3 || '%'))
             THEN 10 ELSE 0
           END
           + (
             ts_rank_cd(
               to_tsvector('simple', COALESCE(a.title, '') || ' ' || COALESCE(a.content, '')),
               plainto_tsquery('simple', TRIM(CONCAT_WS(' ', $1::text, $2::text, $3::text)))
             ) * 30
           )
         )::numeric(10, 2) AS suggestion_score
       FROM knowledge_articles a
       LEFT JOIN knowledge_categories kc ON kc.id = a.category_id
       WHERE a.tenant_id = current_tenant_id()
         AND a.status = 'published'
     )
     SELECT * FROM ranked
     WHERE suggestion_score > 0
     ORDER BY suggestion_score DESC, title ASC
     LIMIT $4::int`,
    [title, description, category, limit],
  );

  return suggestions.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    number: String(row.number),
    title: String(row.title),
    excerpt: String(row.excerpt ?? ''),
    category_name: row.category_name ? String(row.category_name) : null,
    suggestion_score: Number(row.suggestion_score ?? 0),
    path: `/knowledge?articleId=${row.id}`,
  }));
}

export async function getPublishedArticleSummary(
  client: PoolClient,
  articleId: string,
  maxChars = 4000,
): Promise<{ id: string; number: string; title: string; content: string } | null> {
  const res = await client.query(
    `SELECT id, number, title, content
     FROM knowledge_articles
     WHERE id = $1 AND tenant_id = current_tenant_id() AND status = 'published'`,
    [articleId],
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0] as { id: string; number: string; title: string; content: string | null };
  const content = (row.content ?? '').slice(0, maxChars);
  return { id: row.id, number: row.number, title: row.title, content };
}

export async function suggestKbForIncident(
  client: PoolClient,
  incidentId: string,
  limit = 6,
): Promise<KnowledgeSearchHit[]> {
  const incidentRes = await client.query(
    `SELECT i.id, i.title, i.description, i.category, i.subcategory, s.name AS service_name
     FROM incidents i
     LEFT JOIN services s ON s.id = i.service_id
     WHERE i.id = $1`,
    [incidentId],
  );
  if (incidentRes.rows.length === 0) return [];
  const incident = incidentRes.rows[0] as {
    title: string;
    description: string | null;
    category: string | null;
    subcategory: string | null;
    service_name: string | null;
  };

  const suggestions = await client.query(
    `WITH ctx AS (
       SELECT
         $1::uuid AS incident_id,
         COALESCE($2::text, '') AS title,
         COALESCE($3::text, '') AS description,
         COALESCE($4::text, '') AS category,
         COALESCE($5::text, '') AS subcategory,
         COALESCE($6::text, '') AS service_name
     ),
     ranked AS (
       SELECT
         a.id, a.number, a.title,
         LEFT(COALESCE(a.content, ''), 260) AS excerpt,
         kc.name AS category_name,
         (
           ts_rank_cd(
             to_tsvector('simple', COALESCE(a.title, '') || ' ' || COALESCE(a.content, '')),
             plainto_tsquery(
               'simple',
               TRIM(CONCAT_WS(
                 ' ',
                 (SELECT title FROM ctx),
                 (SELECT description FROM ctx),
                 (SELECT category FROM ctx),
                 (SELECT subcategory FROM ctx),
                 (SELECT service_name FROM ctx)
               ))
             )
           ) * 30
         )::numeric(10, 2) AS suggestion_score
       FROM knowledge_articles a
       LEFT JOIN knowledge_categories kc ON kc.id = a.category_id
       WHERE a.tenant_id = current_tenant_id()
         AND a.status = 'published'
     )
     SELECT * FROM ranked
     WHERE suggestion_score > 0
     ORDER BY suggestion_score DESC
     LIMIT $7::int`,
    [
      incidentId,
      incident.title,
      incident.description,
      incident.category,
      incident.subcategory,
      incident.service_name,
      limit,
    ],
  );

  return suggestions.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    number: String(row.number),
    title: String(row.title),
    excerpt: String(row.excerpt ?? ''),
    category_name: row.category_name ? String(row.category_name) : null,
    suggestion_score: Number(row.suggestion_score ?? 0),
    path: `/knowledge?articleId=${row.id}`,
  }));
}
