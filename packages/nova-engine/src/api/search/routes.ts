/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Global Search Route ───
// GET /api/search?q=term&limit=20
//
// Fuzzy search across incidents, changes, problems, knowledge articles,
// and configuration items.
//
// Scoring priority per row:
//   1.00  exact number match         (lower(number) = lower(q))
//   0.80  number prefix              (number ILIKE q || '%')
//   0.60  number substring           (number ILIKE '%' || q || '%')
//   0.50  title substring            (title  ILIKE '%' || q || '%')
//   0.xx  pg_trgm similarity on title/number (fuzzy fallback, threshold 0.10)
//
// All queries are tenant-scoped via RLS session vars set by middleware.

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, setTenantRLS, releaseTenantClient, getRequestClient } from '../../middleware/auth';
import { isFulfillerRole } from '../roles';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const q = String(req.query.q ?? '').trim();
    const parsedLimit = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 50)
      : 20;
    const typeFilter: string | null = req.query.type ? String(req.query.type) : null;

    if (!q || q.length < 1) {
      res.json({ results: [] });
      return;
    }

    const isFulfiller = isFulfillerRole(req);

    const result = await client.query(
      `
      WITH ranked AS (

        -- ── Incidents ──────────────────────────────────────────
        SELECT
          'incident'::text              AS type,
          i.id::text                    AS id,
          i.number                      AS identifier,
          i.title                       AS title,
          (i.status || ' · P' || i.priority) AS subtitle,
          '/incidents/' || i.id         AS path,
          GREATEST(
            CASE WHEN lower(i.number) = lower($1)           THEN 1.00 ELSE 0 END,
            CASE WHEN i.number ILIKE $1 || '%'               THEN 0.80 ELSE 0 END,
            CASE WHEN i.number ILIKE '%' || $1 || '%'        THEN 0.60 ELSE 0 END,
            CASE WHEN i.title  ILIKE '%' || $1 || '%'        THEN 0.50 ELSE 0 END,
            similarity(i.title,  $1) * 0.9,
            similarity(i.number, $1) * 0.7
          )                             AS score
        FROM incidents i
        WHERE (
          lower(i.number) = lower($1)
          OR i.number ILIKE $1 || '%'
          OR i.number ILIKE '%' || $1 || '%'
          OR i.title  ILIKE '%' || $1 || '%'
          OR similarity(i.title,  $1) > 0.10
          OR similarity(i.number, $1) > 0.10
        )
        AND ($4::boolean OR i.caller_id = current_user_id())

        UNION ALL

        -- ── Changes ────────────────────────────────────────────
        SELECT
          'change'::text,
          c.id::text,
          c.number,
          c.title,
          c.status::text,
          '/changes/' || c.id,
          GREATEST(
            CASE WHEN lower(c.number) = lower($1)           THEN 1.00 ELSE 0 END,
            CASE WHEN c.number ILIKE $1 || '%'               THEN 0.80 ELSE 0 END,
            CASE WHEN c.number ILIKE '%' || $1 || '%'        THEN 0.60 ELSE 0 END,
            CASE WHEN c.title  ILIKE '%' || $1 || '%'        THEN 0.50 ELSE 0 END,
            similarity(c.title,  $1) * 0.9,
            similarity(c.number, $1) * 0.7
          )
        FROM changes c
        WHERE (
          lower(c.number) = lower($1)
          OR c.number ILIKE $1 || '%'
          OR c.number ILIKE '%' || $1 || '%'
          OR c.title  ILIKE '%' || $1 || '%'
          OR similarity(c.title,  $1) > 0.10
          OR similarity(c.number, $1) > 0.10
        )
        AND $4::boolean

        UNION ALL

        -- ── Problems ───────────────────────────────────────────
        SELECT
          'problem'::text,
          p.id::text,
          p.number,
          p.title,
          p.status::text,
          '/problems/' || p.id,
          GREATEST(
            CASE WHEN lower(p.number) = lower($1)           THEN 1.00 ELSE 0 END,
            CASE WHEN p.number ILIKE $1 || '%'               THEN 0.80 ELSE 0 END,
            CASE WHEN p.number ILIKE '%' || $1 || '%'        THEN 0.60 ELSE 0 END,
            CASE WHEN p.title  ILIKE '%' || $1 || '%'        THEN 0.50 ELSE 0 END,
            similarity(p.title,  $1) * 0.9,
            similarity(p.number, $1) * 0.7
          )
        FROM problems p
        WHERE (
          lower(p.number) = lower($1)
          OR p.number ILIKE $1 || '%'
          OR p.number ILIKE '%' || $1 || '%'
          OR p.title  ILIKE '%' || $1 || '%'
          OR similarity(p.title,  $1) > 0.10
          OR similarity(p.number, $1) > 0.10
        )

        UNION ALL

        -- ── Knowledge Articles ──────────────────────────────────
        SELECT
          'knowledge'::text,
          ka.id::text,
          ka.number,
          ka.title,
          ka.status::text,
          '/knowledge?articleId=' || ka.id,
          GREATEST(
            CASE WHEN lower(ka.number) = lower($1)          THEN 1.00 ELSE 0 END,
            CASE WHEN ka.number ILIKE $1 || '%'              THEN 0.80 ELSE 0 END,
            CASE WHEN ka.number ILIKE '%' || $1 || '%'       THEN 0.60 ELSE 0 END,
            CASE WHEN ka.title  ILIKE '%' || $1 || '%'       THEN 0.50 ELSE 0 END,
            similarity(ka.title,  $1) * 0.9,
            similarity(ka.number, $1) * 0.7
          )
        FROM knowledge_articles ka
        WHERE (
          lower(ka.number) = lower($1)
          OR ka.number ILIKE $1 || '%'
          OR ka.number ILIKE '%' || $1 || '%'
          OR ka.title  ILIKE '%' || $1 || '%'
          OR similarity(ka.title,  $1) > 0.10
          OR similarity(ka.number, $1) > 0.10
        )
        AND ka.status = 'published'

        UNION ALL

        -- ── Configuration Items ─────────────────────────────────
        SELECT
          'ci'::text,
          ci.id::text,
          ci.name,
          COALESCE(ci.display_name, ci.name),
          cc.name,
          '/cmdb/' || ci.id,
          GREATEST(
            CASE WHEN lower(ci.name) = lower($1)                           THEN 1.00 ELSE 0 END,
            CASE WHEN ci.name ILIKE $1 || '%'                               THEN 0.80 ELSE 0 END,
            CASE WHEN ci.name         ILIKE '%' || $1 || '%'                THEN 0.60 ELSE 0 END,
            CASE WHEN ci.display_name ILIKE '%' || $1 || '%'                THEN 0.50 ELSE 0 END,
            similarity(COALESCE(ci.display_name, ci.name), $1) * 0.9,
            similarity(ci.name, $1) * 0.7
          )
        FROM configuration_items ci
        JOIN ci_classes cc ON cc.id = ci.class_id
        WHERE (
          lower(ci.name) = lower($1)
          OR ci.name         ILIKE $1 || '%'
          OR ci.name         ILIKE '%' || $1 || '%'
          OR ci.display_name ILIKE '%' || $1 || '%'
          OR similarity(COALESCE(ci.display_name, ci.name), $1) > 0.10
          OR similarity(ci.name, $1) > 0.10
        )
        AND $4::boolean

      )
      SELECT type, id, identifier, title, subtitle, path, score
      FROM ranked
      WHERE ($3::text IS NULL OR type = $3)
      ORDER BY score DESC
      LIMIT $2
      `,
      [q, limit, typeFilter, isFulfiller],
    );

    res.json({ results: result.rows });
  } catch (err) {
    next(err);
  }
});

export default router;
