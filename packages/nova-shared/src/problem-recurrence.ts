/* SPDX-License-Identifier: AGPL-3.0-only */

export const DEFAULT_RECURRENCE_THRESHOLD = 3;
export const DEFAULT_TITLE_SIMILARITY = 0.3;

/** Open incidents grouped by shared CI or service and similar titles. $1 similarity, $2 threshold. */
export const PROBLEM_RECURRENCE_CANDIDATE_SQL = `
WITH open_inc AS (
  SELECT i.id, i.number, i.title, i.status, i.priority, i.configuration_item_id, i.service_id, i.created_at
  FROM incidents i
  WHERE i.tenant_id = current_tenant_id()
    AND i.status NOT IN ('resolved', 'closed', 'cancelled')
    AND (i.configuration_item_id IS NOT NULL OR i.service_id IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM problem_incidents pi
      JOIN problems p ON p.id = pi.problem_id
      WHERE pi.tenant_id = current_tenant_id()
        AND pi.incident_id = i.id
        AND p.status NOT IN ('resolved', 'closed')
    )
),
matched AS (
  SELECT
    a.id AS seed_id,
    a.title AS representative_title,
    a.configuration_item_id,
    a.service_id,
    b.id AS peer_id,
    b.number AS peer_number,
    b.title AS peer_title,
    b.status AS peer_status,
    b.priority AS peer_priority,
    similarity(a.title, b.title) AS title_similarity
  FROM open_inc a
  JOIN open_inc b
    ON (
      (a.configuration_item_id IS NOT NULL AND a.configuration_item_id = b.configuration_item_id)
      OR (a.service_id IS NOT NULL AND a.service_id = b.service_id)
    )
   AND similarity(a.title, b.title) >= $1
),
grouped AS (
  SELECT
    seed_id,
    representative_title,
    configuration_item_id,
    service_id,
    array_agg(peer_id ORDER BY peer_id) AS incident_ids,
    jsonb_agg(
      jsonb_build_object(
        'id', peer_id,
        'number', peer_number,
        'title', peer_title,
        'status', peer_status,
        'priority', peer_priority,
        'title_similarity', round(title_similarity::numeric, 3)
      )
      ORDER BY peer_id
    ) AS incidents,
    count(*)::int AS incident_count,
    avg(title_similarity)::float AS avg_similarity
  FROM matched
  GROUP BY seed_id, representative_title, configuration_item_id, service_id
  HAVING count(*) >= $2
)
SELECT
  g.seed_id,
  g.representative_title,
  g.configuration_item_id,
  g.service_id,
  ci.display_name AS configuration_item_name,
  s.name AS service_name,
  g.incident_ids,
  g.incidents,
  g.incident_count,
  g.avg_similarity
FROM grouped g
LEFT JOIN configuration_items ci ON ci.id = g.configuration_item_id
LEFT JOIN services s ON s.id = g.service_id
WHERE g.seed_id = (SELECT min(x) FROM unnest(g.incident_ids) AS x)
ORDER BY g.incident_count DESC, g.avg_similarity DESC
LIMIT 50`;
