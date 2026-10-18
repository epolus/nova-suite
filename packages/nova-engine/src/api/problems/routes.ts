/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import {
  authenticate,
  getRequestClient,
  releaseTenantClient,
  setTenantRLS,
} from '../../middleware/auth';
import { validateBody, validateQuery } from '../../middleware/validate';
import { createProblemSchema, paginationSchema, updateProblemSchema } from '../../domain/schemas';
import { AppError, NotFound } from '../../middleware/errorHandler';
import { isAdminRole, hasProblemRole } from '../roles';
import { enqueueNotificationDispatchStartJob } from '../../temporal/workflow-start-queue';
import { resolveSlaDueAt } from '../../domain/sla';
import { canRetireKnownError, hasKnownErrorContent } from '../../domain/known-errors';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

const PROBLEM_PROCESS_NAME = 'Problem Management';

function hasElevatedProblemRole(req: Request): boolean {
  return hasProblemRole(req);
}

async function linkedChangeCount(client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ c?: number }> }> }, problemId: string): Promise<number> {
  const row = await client.query(
    `SELECT count(*)::int AS c
     FROM changes
     WHERE tenant_id = current_tenant_id()
       AND related_problem_id = $1
       AND status NOT IN ('cancelled', 'rejected')`,
    [problemId],
  );
  return Number(row.rows[0]?.c || 0);
}

async function upsertKnownErrorForProblem(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  problem: { id: string; title: string; symptoms: string | null; workaround: string | null; priority?: string | null },
): Promise<void> {
  const symptoms = String(problem.symptoms || '').trim();
  const workaround = String(problem.workaround || '').trim();
  const updated = await client.query(
    `UPDATE known_errors
     SET title = $2,
         symptoms = $3,
         workaround = $4,
         is_active = true,
         updated_at = now()
     WHERE id = (
       SELECT id FROM known_errors
       WHERE tenant_id = current_tenant_id()
         AND problem_id = $1
       ORDER BY is_active DESC, updated_at DESC
       LIMIT 1
     )
     RETURNING id`,
    [problem.id, problem.title, symptoms, workaround],
  );
  if (updated.rows.length > 0) return;
  const severity = ['low', 'medium', 'high', 'critical'].includes(String(problem.priority))
    ? problem.priority
    : 'medium';
  await client.query(
    `INSERT INTO known_errors
     (tenant_id, problem_id, title, symptoms, workaround, severity, is_active)
     VALUES (current_tenant_id(), $1, $2, $3, $4, $5, true)`,
    [problem.id, problem.title, symptoms, workaround, severity],
  );
}

async function canWorkOnProblem(client: any, req: Request, problem: any): Promise<boolean> {
  const isAdmin = isAdminRole(req);
  if (isAdmin) return true;

  if (problem.assignment_group_id) {
    const m = await client.query(
      `SELECT 1 FROM assignment_group_members
       WHERE tenant_id = current_tenant_id()
         AND group_id = $1
         AND user_id = $2
       LIMIT 1`,
      [problem.assignment_group_id, req.user!.id],
    );
    if (m.rows.length > 0) return true;
    return false;
  }

  if (problem.reported_by === req.user!.id) return true;
  return hasElevatedProblemRole(req);
}

async function isProblemEnabledGroup(client: any, groupId: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1
     FROM assignment_groups ag
     WHERE ag.tenant_id = current_tenant_id()
       AND ag.id = $1
       AND (
         EXISTS (
           SELECT 1
           FROM assignment_group_processes agp
           JOIN processes p ON p.id = agp.process_id
           WHERE agp.tenant_id = current_tenant_id()
             AND agp.group_id = ag.id
             AND p.tenant_id = current_tenant_id()
             AND p.is_active = true
             AND p.name = $2
         )
         OR EXISTS (
           SELECT 1
           FROM assignment_group_members agm
           JOIN user_roles ur ON ur.user_id = agm.user_id AND ur.tenant_id = current_tenant_id()
           JOIN roles r ON r.id = ur.role_id AND r.tenant_id = current_tenant_id()
           WHERE agm.tenant_id = current_tenant_id()
             AND agm.group_id = ag.id
             AND r.name = 'problem'
             AND r.is_active = true
         )
       )
     LIMIT 1`,
    [groupId, PROBLEM_PROCESS_NAME],
  );
  return r.rows.length > 0;
}

router.get('/assignment-groups', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT ag.id, ag.name, ag.description, ag.is_active
       FROM assignment_groups ag
       WHERE ag.tenant_id = current_tenant_id()
         AND ag.is_active = true
         AND (
           EXISTS (
             SELECT 1
             FROM assignment_group_processes agp
             JOIN processes p ON p.id = agp.process_id
             WHERE agp.tenant_id = current_tenant_id()
               AND agp.group_id = ag.id
               AND p.tenant_id = current_tenant_id()
               AND p.is_active = true
               AND p.name = $1
           )
           OR EXISTS (
             SELECT 1
             FROM assignment_group_members agm
             JOIN user_roles ur ON ur.user_id = agm.user_id AND ur.tenant_id = current_tenant_id()
             JOIN roles r ON r.id = ur.role_id AND r.tenant_id = current_tenant_id()
             WHERE agm.tenant_id = current_tenant_id()
               AND agm.group_id = ag.id
               AND r.name = 'problem'
               AND r.is_active = true
           )
         )
       ORDER BY ag.name`,
      [PROBLEM_PROCESS_NAME],
    );
    res.json({ assignment_groups: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/incidents/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const q = String(req.query.q || '').trim();
    if (!q) return void res.json({ incidents: [] });
    const rows = await client.query(
      `SELECT i.id, i.number, i.title, i.status
       FROM incidents i
       WHERE i.tenant_id = current_tenant_id()
         AND (i.number ILIKE $1 OR i.title ILIKE $1)
       ORDER BY i.updated_at DESC
       LIMIT 25`,
      [`%${q}%`],
    );
    res.json({ incidents: rows.rows });
  } catch (err) {
    next(err);
  }
});

const DEFAULT_RECURRENCE_THRESHOLD = 3;
const DEFAULT_TITLE_SIMILARITY = 0.3;

router.get('/incidents/recurrence-candidates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasElevatedProblemRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const threshold = Math.max(2, Number(req.query.threshold) || DEFAULT_RECURRENCE_THRESHOLD);
    const similarity = Math.min(1, Math.max(0.1, Number(req.query.similarity) || DEFAULT_TITLE_SIMILARITY));

    const rows = await client.query(
      `WITH open_inc AS (
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
       LIMIT 50`,
      [similarity, threshold],
    );

    res.json({
      candidates: rows.rows,
      threshold,
      similarity,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/from-recurring-incidents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasElevatedProblemRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const b = req.body || {};
    const incidentIds: string[] = Array.isArray(b.incident_ids)
      ? b.incident_ids.map((x: unknown) => String(x)).filter(Boolean)
      : [];
    if (incidentIds.length < 2) throw new AppError(400, 'incident_ids must include at least 2 incidents');
    if (!b.assignment_group_id) throw new AppError(400, 'assignment_group_id is required');

    const createGroupOk = await isProblemEnabledGroup(client, b.assignment_group_id);
    if (!createGroupOk) throw new AppError(400, 'Assignment group is not enabled for Problem Management');

    const incidentsRes = await client.query(
      `SELECT id, number, title, configuration_item_id, service_id, status
       FROM incidents
       WHERE tenant_id = current_tenant_id()
         AND id = ANY($1::uuid[])
         AND status NOT IN ('resolved', 'closed', 'cancelled')`,
      [incidentIds],
    );
    if (incidentsRes.rows.length < 2) {
      throw new AppError(400, 'At least 2 open incidents are required to create a problem from recurrence');
    }

    const title = String(b.title || incidentsRes.rows[0].title || '').trim();
    if (!title) throw new AppError(400, 'title is required');

    const affectedCi = b.affected_ci
      || incidentsRes.rows.find((r: { configuration_item_id: string | null }) => r.configuration_item_id)?.configuration_item_id
      || null;

    const seq = await client.query(`SELECT nextval('problem_number_seq') AS n`);
    const number = `PRB${String(seq.rows[0].n).padStart(7, '0')}`;
    const slaDueAt = await resolveSlaDueAt(client, 'problem', {
      priority: b.priority || 'medium',
      impact: b.impact || 'medium',
      category: b.category || null,
      serviceId: null,
    });

    const description = b.description
      || `Created from ${incidentsRes.rows.length} recurring incidents: ${incidentsRes.rows.map((r: { number: string }) => r.number).join(', ')}`;

    const created = await client.query(
      `INSERT INTO problems (
         tenant_id, number, title, description, priority, impact, category, status,
         root_cause, symptoms, workaround, permanent_fix,
         reported_by, assigned_to, assignment_group_id, affected_ci, resolution_notes,
         sla_due_at, sla_breached
       ) VALUES (
         current_tenant_id(), $1, $2, $3, $4, $5, $6, COALESCE($7::problem_status_enum, 'new'::problem_status_enum),
         $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, false
       ) RETURNING *`,
      [
        number,
        title,
        description,
        b.priority || 'medium',
        b.impact || 'medium',
        b.category || null,
        b.status || null,
        b.root_cause || null,
        b.symptoms || null,
        b.workaround || null,
        b.permanent_fix || null,
        b.reported_by || req.user!.id,
        b.assigned_to || null,
        b.assignment_group_id,
        affectedCi,
        b.resolution_notes || null,
        slaDueAt.resolutionDueAt,
      ],
    );
    const createdProblem = created.rows[0];

    for (const row of incidentsRes.rows) {
      await client.query(
        `INSERT INTO problem_incidents (tenant_id, problem_id, incident_id, relationship_type)
         VALUES (current_tenant_id(), $1, $2, 'caused_by')
         ON CONFLICT (tenant_id, problem_id, incident_id) DO UPDATE
         SET relationship_type = EXCLUDED.relationship_type`,
        [createdProblem.id, row.id],
      );
    }

    enqueueNotificationDispatchStartJob({
      tenantId: req.user!.tenant_id,
      entityType: 'problem',
      triggerKey: 'problem.created',
      entityId: String(createdProblem.id),
      actorUserId: req.user!.id,
    }).catch(() => {});

    res.status(201).json({
      ...createdProblem,
      linked_incident_ids: incidentsRes.rows.map((r: { id: string }) => r.id),
    });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/',
  validateQuery(paginationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { page, limit } = req.query as any;
      const offset = (page - 1) * limit;

      const conditions: string[] = ['p.tenant_id = current_tenant_id()'];
      const params: unknown[] = [];
      let idx = 1;

      if (!hasElevatedProblemRole(req)) {
        conditions.push(`(p.reported_by = $${idx} OR p.assigned_to = $${idx})`);
        params.push(req.user!.id);
        idx++;
      }

      if (req.query.status) {
        conditions.push(`p.status = $${idx++}`);
        params.push(req.query.status);
      }
      if (req.query.priority) {
        conditions.push(`p.priority = $${idx++}`);
        params.push(req.query.priority);
      }
      if (req.query.assignment_group_id) {
        conditions.push(`p.assignment_group_id = $${idx++}`);
        params.push(req.query.assignment_group_id);
      }
      if (req.query.affected_ci) {
        conditions.push(`p.affected_ci = $${idx++}`);
        params.push(req.query.affected_ci);
      }
      if (req.query.search) {
        conditions.push(`(p.number ILIKE $${idx} OR p.title ILIKE $${idx} OR p.description ILIKE $${idx})`);
        params.push(`%${req.query.search}%`);
        idx++;
      }

      const cfMap: Record<string, string> = {
        number: 'p.number',
        title: 'p.title',
        status: 'p.status::text',
        priority: 'p.priority::text',
        category: 'p.category',
        assignment_group_name: 'ag.name',
        assigned_to_name: 'u.display_name',
        reported_by_name: 'r.display_name',
      };
      for (const [qKey, qVal] of Object.entries(req.query)) {
        if (qKey.startsWith('cf.') && typeof qVal === 'string' && qVal) {
          const col = cfMap[qKey.slice(3)];
          if (col) {
            conditions.push(`${col} ILIKE $${idx++}`);
            params.push(`${qVal}%`);
          }
        }
      }

      const where = `WHERE ${conditions.join(' AND ')}`;

      const allowedSortCols: Record<string, string> = {
        number: 'p.number',
        title: 'p.title',
        status: 'p.status',
        priority: 'p.priority',
        category: 'p.category',
        assignment_group_name: 'ag.name',
        assigned_to_name: 'u.display_name',
        created_at: 'p.created_at',
        updated_at: 'p.updated_at',
      };
      const sortCol = allowedSortCols[String(req.query.sort_by || '')];
      const sortDir = req.query.sort_dir === 'desc' ? 'DESC' : 'ASC';
      const orderClause = sortCol ? `ORDER BY ${sortCol} ${sortDir}` : 'ORDER BY p.created_at DESC';

      const count = await client.query(
        `SELECT count(*)
         FROM problems p
         LEFT JOIN assignment_groups ag ON ag.id = p.assignment_group_id
         LEFT JOIN users u ON u.id = p.assigned_to
         LEFT JOIN users r ON r.id = p.reported_by
         ${where}`,
        params,
      );
      const total = Number(count.rows[0]?.count || 0);

      params.push(limit, offset);
      const list = await client.query(
        `SELECT p.*,
                ag.name AS assignment_group_name,
                u.display_name AS assigned_to_name,
                r.display_name AS reported_by_name,
                ci.display_name AS affected_ci_name,
                COALESCE(pi_stats.incident_count, 0)::int AS incident_count,
                COALESCE(pi_stats.open_incident_count, 0)::int AS open_incident_count
         FROM problems p
         LEFT JOIN assignment_groups ag ON ag.id = p.assignment_group_id
         LEFT JOIN users u ON u.id = p.assigned_to
         LEFT JOIN users r ON r.id = p.reported_by
         LEFT JOIN configuration_items ci ON ci.id = p.affected_ci
         LEFT JOIN (
           SELECT pi.problem_id,
                  count(*) AS incident_count,
                  count(*) FILTER (WHERE i.status <> 'closed') AS open_incident_count
           FROM problem_incidents pi
           JOIN incidents i ON i.id = pi.incident_id
           WHERE pi.tenant_id = current_tenant_id()
           GROUP BY pi.problem_id
         ) pi_stats ON pi_stats.problem_id = p.id
         ${where}
         ${orderClause}
         LIMIT $${idx} OFFSET $${idx + 1}`,
        params,
      );

      res.json({
        problems: list.rows,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/nav', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const currentId = String(req.query.current || '');
    if (!currentId) return void res.json({ prev_id: null, next_id: null });

    const conditions: string[] = ['p.tenant_id = current_tenant_id()'];
    const params: unknown[] = [];
    let idx = 1;

    if (!hasElevatedProblemRole(req)) {
      conditions.push(`(p.reported_by = $${idx} OR p.assigned_to = $${idx})`);
      params.push(req.user!.id);
      idx++;
    }
    if (req.query.status) { conditions.push(`p.status = $${idx++}`); params.push(req.query.status); }
    if (req.query.priority) { conditions.push(`p.priority = $${idx++}`); params.push(req.query.priority); }
    if (req.query.assignment_group_id) { conditions.push(`p.assignment_group_id = $${idx++}`); params.push(req.query.assignment_group_id); }
    if (req.query.affected_ci) { conditions.push(`p.affected_ci = $${idx++}`); params.push(req.query.affected_ci); }
    if (req.query.search) {
      conditions.push(`(p.number ILIKE $${idx} OR p.title ILIKE $${idx} OR p.description ILIKE $${idx})`);
      params.push(`%${req.query.search}%`);
      idx++;
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const allowedSortCols: Record<string, string> = {
      number: 'p.number',
      title: 'p.title',
      status: 'p.status',
      priority: 'p.priority',
      category: 'p.category',
      assignment_group_name: 'ag.name',
      assigned_to_name: 'u.display_name',
      created_at: 'p.created_at',
      updated_at: 'p.updated_at',
    };
    const sortCol = allowedSortCols[String(req.query.sort_by || '')];
    const sortDir = req.query.sort_dir === 'desc' ? 'DESC' : 'ASC';
    const orderClause = sortCol ? `ORDER BY ${sortCol} ${sortDir}` : 'ORDER BY p.created_at DESC';

    const rows = await client.query(
      `SELECT p.id
       FROM problems p
       LEFT JOIN assignment_groups ag ON ag.id = p.assignment_group_id
       LEFT JOIN users u ON u.id = p.assigned_to
       ${where}
       ${orderClause}`,
      params,
    );
    const ids: string[] = rows.rows.map((r: { id: string }) => r.id);
    const pos = ids.indexOf(currentId);
    res.json({
      prev_id: pos > 0 ? ids[pos - 1] : null,
      next_id: pos >= 0 && pos < ids.length - 1 ? ids[pos + 1] : null,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/by-ci/:ciId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT id, number, title, status, priority, updated_at
       FROM problems
       WHERE tenant_id = current_tenant_id()
         AND affected_ci = $1
       ORDER BY updated_at DESC`,
      [req.params.ciId],
    );
    res.json({ problems: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const row = await client.query(
      `SELECT p.*,
              ag.name AS assignment_group_name,
              u.display_name AS assigned_to_name,
              r.display_name AS reported_by_name,
              ci.display_name AS affected_ci_name,
              COALESCE(pi_stats.incident_count, 0)::int AS incident_count,
              COALESCE(pi_stats.open_incident_count, 0)::int AS open_incident_count
       FROM problems p
       LEFT JOIN assignment_groups ag ON ag.id = p.assignment_group_id
       LEFT JOIN users u ON u.id = p.assigned_to
       LEFT JOIN users r ON r.id = p.reported_by
       LEFT JOIN configuration_items ci ON ci.id = p.affected_ci
       LEFT JOIN (
         SELECT pi.problem_id,
                count(*) AS incident_count,
                count(*) FILTER (WHERE i.status <> 'closed') AS open_incident_count
         FROM problem_incidents pi
         JOIN incidents i ON i.id = pi.incident_id
         WHERE pi.tenant_id = current_tenant_id()
         GROUP BY pi.problem_id
       ) pi_stats ON pi_stats.problem_id = p.id
       WHERE p.id = $1 AND p.tenant_id = current_tenant_id()`,
      [req.params.id],
    );
    if (row.rows.length === 0) throw NotFound('Problem not found');
    const problem = row.rows[0];
    if (!hasElevatedProblemRole(req) && problem.reported_by !== req.user!.id && problem.assigned_to !== req.user!.id) {
      throw new AppError(403, 'Insufficient permissions');
    }
    res.json(problem);
  } catch (err) {
    next(err);
  }
});

router.post('/', validateBody(createProblemSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasElevatedProblemRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const b = req.body || {};

    if (!b.assignment_group_id) {
      throw new AppError(400, 'assignment_group_id is required');
    }
    const createGroupOk = await isProblemEnabledGroup(client, b.assignment_group_id);
    if (!createGroupOk) throw new AppError(400, 'Assignment group is not enabled for Problem Management');

    const seq = await client.query(`SELECT nextval('problem_number_seq') AS n`);
    const number = `PRB${String(seq.rows[0].n).padStart(7, '0')}`;
    const sla = await resolveSlaDueAt(client, 'problem', {
      priority: b.priority || 'medium',
      impact: b.impact || 'medium',
      category: b.category || null,
      serviceId: null,
    });
    const created = await client.query(
      `INSERT INTO problems (
         tenant_id, number, title, description, priority, impact, category, status,
         root_cause, symptoms, workaround, permanent_fix,
         reported_by, assigned_to, assignment_group_id, affected_ci, resolution_notes,
         sla_due_at, sla_breached
       ) VALUES (
         current_tenant_id(), $1, $2, $3, $4, $5, $6, COALESCE($7::problem_status_enum, 'new'::problem_status_enum),
         $8, $9, $10, $11,
         $12, $13, $14, $15, $16, $17, false
       ) RETURNING *`,
      [
        number,
        b.title,
        b.description || null,
        b.priority || 'medium',
        b.impact || 'medium',
        b.category || null,
        b.status || null,
        b.root_cause || null,
        b.symptoms || null,
        b.workaround || null,
        b.permanent_fix || null,
        b.reported_by || req.user!.id,
        b.assigned_to || null,
        b.assignment_group_id || null,
        b.affected_ci || null,
        b.resolution_notes || null,
        sla.resolutionDueAt,
      ],
    );
    const createdProblem = created.rows[0];
    enqueueNotificationDispatchStartJob({
      tenantId: req.user!.tenant_id,
      entityType: 'problem',
      triggerKey: 'problem.created',
      entityId: String(createdProblem.id),
      actorUserId: req.user!.id,
    }).catch(() => {});
    res.status(201).json(createdProblem);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validateBody(updateProblemSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const currentRes = await client.query(
      `SELECT * FROM problems WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [req.params.id],
    );
    if (currentRes.rows.length === 0) throw NotFound('Problem not found');
    const current = currentRes.rows[0];

    const canWork = await canWorkOnProblem(client, req, current);
    if (!canWork) throw new AppError(403, 'Only assigned problem group members or admins can work on this problem');

    const updates = req.body || {};
    if (
      updates.assignment_group_id !== undefined
      && (updates.assignment_group_id === null || String(updates.assignment_group_id).trim() === '')
    ) {
      throw new AppError(400, 'assignment_group_id is required');
    }
    const effectiveAssignmentGroupId = updates.assignment_group_id ?? current.assignment_group_id;
    if (!effectiveAssignmentGroupId) {
      throw new AppError(400, 'assignment_group_id is required');
    }
    if (updates.assignment_group_id !== undefined) {
      const ok = await isProblemEnabledGroup(client, updates.assignment_group_id);
      if (!ok) throw new AppError(400, 'Assignment group is not enabled for Problem Management');
    }

    const nextStatus = updates.status !== undefined ? String(updates.status) : String(current.status);
    if (nextStatus === 'known_error') {
      const symptoms = updates.symptoms !== undefined ? updates.symptoms : current.symptoms;
      const workaround = updates.workaround !== undefined ? updates.workaround : current.workaround;
      if (!hasKnownErrorContent(symptoms, workaround)) {
        throw new AppError(400, 'Symptoms and a workaround are required before marking a problem as a known error');
      }
    }
    const retiringKnownError = ['resolved', 'closed'].includes(nextStatus)
      && !['resolved', 'closed'].includes(String(current.status));
    if (retiringKnownError) {
      const active = await client.query(
        `SELECT count(*)::int AS c
         FROM known_errors
         WHERE tenant_id = current_tenant_id()
           AND problem_id = $1
           AND is_active = true`,
        [req.params.id],
      );
      const hasActiveKnownError = Number(active.rows[0]?.c || 0) > 0 || current.status === 'known_error';
      if (hasActiveKnownError) {
        const permanentFix = updates.permanent_fix !== undefined ? updates.permanent_fix : current.permanent_fix;
        const changes = await linkedChangeCount(client, String(req.params.id));
        if (!canRetireKnownError(permanentFix, changes)) {
          throw new AppError(400, 'A permanent fix or a linked change is required before closing a known error');
        }
      }
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(updates)) {
      sets.push(`${k} = $${i++}`);
      vals.push(v);
    }
    if (updates.status === 'resolved' && !current.resolved_at) {
      sets.push(`resolved_at = now()`);
      sets.push(`resolved_by = $${i++}`);
      vals.push(req.user!.id);
      sets.push(`sla_breached = CASE WHEN sla_due_at IS NOT NULL AND now() > sla_due_at THEN true ELSE sla_breached END`);
    }
    if (updates.status === 'closed' && !current.closed_at) {
      sets.push(`closed_at = now()`);
      sets.push(`closed_by = $${i++}`);
      vals.push(req.user!.id);
    }
    if (updates.status && ['resolved', 'closed'].includes(String(updates.status))) {
      sets.push(`sla_due_at = NULL`);
    } else if (
      updates.priority !== undefined
      || updates.impact !== undefined
      || updates.category !== undefined
      || updates.status !== undefined
    ) {
      const nextStatus = String(updates.status ?? current.status);
      if (!['resolved', 'closed'].includes(nextStatus)) {
        const due = await resolveSlaDueAt(client, 'problem', {
          priority: updates.priority ?? current.priority,
          impact: updates.impact ?? current.impact,
          category: updates.category ?? current.category,
          serviceId: null,
        });
        sets.push(`sla_due_at = $${i++}`);
        vals.push(due.resolutionDueAt);
        sets.push('sla_breached = false');
      }
    }
    if (sets.length === 0) return void res.json(current);
    vals.push(req.params.id);
    const updated = await client.query(
      `UPDATE problems
       SET ${sets.join(', ')}
       WHERE id = $${i} AND tenant_id = current_tenant_id()
       RETURNING *`,
      vals,
    );
    const updatedProblem = updated.rows[0];
    if (updatedProblem.status === 'known_error') {
      await upsertKnownErrorForProblem(client, updatedProblem);
    }
    if (retiringKnownError) {
      await client.query(
        `UPDATE known_errors
         SET is_active = false, updated_at = now()
         WHERE tenant_id = current_tenant_id()
           AND problem_id = $1
           AND is_active = true`,
        [req.params.id],
      );
    }
    if (updates.assigned_to !== undefined && String(updates.assigned_to || '') !== String(current.assigned_to || '')) {
      enqueueNotificationDispatchStartJob({
        tenantId: req.user!.tenant_id,
        entityType: 'problem',
        triggerKey: 'problem.assigned',
        entityId: String(req.params.id),
        actorUserId: req.user!.id,
      }).catch(() => {});
    }
    if (updates.status === 'resolved' && current.status !== 'resolved') {
      enqueueNotificationDispatchStartJob({
        tenantId: req.user!.tenant_id,
        entityType: 'problem',
        triggerKey: 'problem.resolved',
        entityId: String(req.params.id),
        actorUserId: req.user!.id,
      }).catch(() => {});
    }
    res.json(updatedProblem);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/incidents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT pi.problem_id, pi.incident_id, pi.relationship_type, pi.created_at,
              i.number AS incident_number, i.title AS incident_title, i.status AS incident_status
       FROM problem_incidents pi
       JOIN incidents i ON i.id = pi.incident_id
       WHERE pi.problem_id = $1
         AND pi.tenant_id = current_tenant_id()
       ORDER BY pi.created_at DESC`,
      [req.params.id],
    );
    res.json({ incidents: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT t.*, u.display_name AS assigned_to_name
       FROM problem_tasks t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.tenant_id = current_tenant_id()
         AND t.problem_id = $1
       ORDER BY CASE t.status
         WHEN 'in_progress' THEN 0
         WHEN 'pending' THEN 1
         WHEN 'blocked' THEN 2
         ELSE 3
       END, t.created_at DESC`,
      [req.params.id],
    );
    res.json({ tasks: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const problemRes = await client.query(
      `SELECT * FROM problems WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [req.params.id],
    );
    if (problemRes.rows.length === 0) throw NotFound('Problem not found');
    const canWork = await canWorkOnProblem(client, req, problemRes.rows[0]);
    if (!canWork) throw new AppError(403, 'Only assigned problem group members or admins can work on this problem');

    const { title, description, task_type, status, assigned_to, due_date } = req.body || {};
    if (!title) throw new AppError(400, 'title is required');
    const created = await client.query(
      `INSERT INTO problem_tasks
       (tenant_id, problem_id, title, description, task_type, status, assigned_to, due_date)
       VALUES (current_tenant_id(), $1, $2, $3, $4, COALESCE($5, 'pending'), $6, $7)
       RETURNING *`,
      [req.params.id, title, description || null, task_type || null, status || null, assigned_to || null, due_date || null],
    );
    res.status(201).json(created.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/tasks/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const problemRes = await client.query(
      `SELECT * FROM problems WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [req.params.id],
    );
    if (problemRes.rows.length === 0) throw NotFound('Problem not found');
    const canWork = await canWorkOnProblem(client, req, problemRes.rows[0]);
    if (!canWork) throw new AppError(403, 'Only assigned problem group members or admins can work on this problem');

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(req.body || {})) {
      sets.push(`${k} = $${i++}`);
      vals.push(v);
    }
    if (req.body?.status === 'completed') sets.push(`completed_at = now()`);
    if (sets.length === 0) return void res.json({ success: true });
    vals.push(req.params.id, req.params.taskId);
    const updated = await client.query(
      `UPDATE problem_tasks
       SET ${sets.join(', ')}
       WHERE tenant_id = current_tenant_id()
         AND problem_id = $${i}
         AND id = $${i + 1}
       RETURNING *`,
      vals,
    );
    if (updated.rows.length === 0) throw NotFound('Problem task not found');
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/tasks/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const problemRes = await client.query(
      `SELECT * FROM problems WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [req.params.id],
    );
    if (problemRes.rows.length === 0) throw NotFound('Problem not found');
    const canWork = await canWorkOnProblem(client, req, problemRes.rows[0]);
    if (!canWork) throw new AppError(403, 'Only assigned problem group members or admins can work on this problem');
    await client.query(
      `DELETE FROM problem_tasks
       WHERE tenant_id = current_tenant_id()
         AND problem_id = $1
         AND id = $2`,
      [req.params.id, req.params.taskId],
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

async function resolveKbArticleId(
  client: any,
  kbArticleId: unknown,
): Promise<string | null | undefined> {
  if (kbArticleId === undefined) return undefined;
  if (kbArticleId === null || kbArticleId === '') return null;
  const article = await client.query(
    `SELECT id FROM knowledge_articles
     WHERE tenant_id = current_tenant_id() AND id = $1`,
    [String(kbArticleId)],
  );
  if (article.rows.length === 0) throw new AppError(400, 'kb_article_id not found');
  return String(kbArticleId);
}

const KNOWN_ERROR_SELECT = `SELECT ke.*,
       ka.number AS kb_article_number,
       ka.title AS kb_article_title
FROM known_errors ke
LEFT JOIN knowledge_articles ka ON ka.id = ke.kb_article_id AND ka.tenant_id = current_tenant_id()`;

router.get('/:id/known-errors', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `${KNOWN_ERROR_SELECT}
       WHERE ke.tenant_id = current_tenant_id()
         AND ke.problem_id = $1
       ORDER BY ke.is_active DESC, ke.updated_at DESC`,
      [req.params.id],
    );
    res.json({ known_errors: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/known-errors', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const problemRes = await client.query(
      `SELECT * FROM problems WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [req.params.id],
    );
    if (problemRes.rows.length === 0) throw NotFound('Problem not found');
    const canWork = await canWorkOnProblem(client, req, problemRes.rows[0]);
    if (!canWork) throw new AppError(403, 'Only assigned problem group members or admins can work on this problem');
    const { title, symptoms, workaround, permanent_fix_eta, tags, severity, is_active, kb_article_id } = req.body || {};
    if (!title || !symptoms || !workaround) throw new AppError(400, 'title, symptoms and workaround are required');
    const kbArticleId = await resolveKbArticleId(client, kb_article_id);
    const created = await client.query(
      `INSERT INTO known_errors
       (tenant_id, problem_id, title, symptoms, workaround, permanent_fix_eta, tags, severity, is_active, kb_article_id)
       VALUES (current_tenant_id(), $1, $2, $3, $4, $5, COALESCE($6, '{}'::text[]), $7, COALESCE($8, true), $9)
       RETURNING *`,
      [req.params.id, title, symptoms, workaround, permanent_fix_eta || null, Array.isArray(tags) ? tags : [], severity || null, is_active, kbArticleId ?? null],
    );
    const row = await client.query(
      `${KNOWN_ERROR_SELECT}
       WHERE ke.tenant_id = current_tenant_id() AND ke.id = $1`,
      [created.rows[0].id],
    );
    res.status(201).json(row.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/known-errors/:knownErrorId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const problemRes = await client.query(
      `SELECT * FROM problems WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [req.params.id],
    );
    if (problemRes.rows.length === 0) throw NotFound('Problem not found');
    const canWork = await canWorkOnProblem(client, req, problemRes.rows[0]);
    if (!canWork) throw new AppError(403, 'Only assigned problem group members or admins can work on this problem');

    const allowed = new Set([
      'title', 'symptoms', 'workaround', 'permanent_fix_eta', 'tags', 'severity', 'is_active', 'kb_article_id',
    ]);
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(req.body || {})) {
      if (!allowed.has(k)) continue;
      if (k === 'kb_article_id') {
        const kbArticleId = await resolveKbArticleId(client, v);
        sets.push(`kb_article_id = $${i++}`);
        vals.push(kbArticleId ?? null);
        continue;
      }
      sets.push(`${k} = $${i++}`);
      vals.push(k === 'tags' && !Array.isArray(v) ? [] : v);
    }
    if (sets.length === 0) return void res.json({ success: true });
    if (req.body?.is_active === false) {
      const changes = await linkedChangeCount(client, String(req.params.id));
      if (!canRetireKnownError(problemRes.rows[0].permanent_fix, changes)) {
        throw new AppError(400, 'A permanent fix or a linked change is required before closing a known error');
      }
    }
    vals.push(req.params.id, req.params.knownErrorId);
    const updated = await client.query(
      `UPDATE known_errors
       SET ${sets.join(', ')}
       WHERE tenant_id = current_tenant_id()
         AND problem_id = $${i}
         AND id = $${i + 1}
       RETURNING id`,
      vals,
    );
    if (updated.rows.length === 0) throw NotFound('Known error not found');
    const row = await client.query(
      `${KNOWN_ERROR_SELECT}
       WHERE ke.tenant_id = current_tenant_id() AND ke.id = $1`,
      [updated.rows[0].id],
    );
    res.json(row.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/known-errors/:knownErrorId/kb-article', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const problemRes = await client.query(
      `SELECT * FROM problems WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [req.params.id],
    );
    if (problemRes.rows.length === 0) throw NotFound('Problem not found');
    const canWork = await canWorkOnProblem(client, req, problemRes.rows[0]);
    if (!canWork) throw new AppError(403, 'Only assigned problem group members or admins can work on this problem');

    const kbArticleId = await resolveKbArticleId(client, req.body?.kb_article_id);
    if (!kbArticleId) throw new AppError(400, 'kb_article_id is required');

    const updated = await client.query(
      `UPDATE known_errors
       SET kb_article_id = $3
       WHERE tenant_id = current_tenant_id()
         AND problem_id = $1
         AND id = $2
       RETURNING id`,
      [req.params.id, req.params.knownErrorId, kbArticleId],
    );
    if (updated.rows.length === 0) throw NotFound('Known error not found');
    const row = await client.query(
      `${KNOWN_ERROR_SELECT}
       WHERE ke.tenant_id = current_tenant_id() AND ke.id = $1`,
      [updated.rows[0].id],
    );
    res.json(row.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/known-errors/:knownErrorId/kb-article', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const problemRes = await client.query(
      `SELECT * FROM problems WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [req.params.id],
    );
    if (problemRes.rows.length === 0) throw NotFound('Problem not found');
    const canWork = await canWorkOnProblem(client, req, problemRes.rows[0]);
    if (!canWork) throw new AppError(403, 'Only assigned problem group members or admins can work on this problem');

    const updated = await client.query(
      `UPDATE known_errors
       SET kb_article_id = NULL
       WHERE tenant_id = current_tenant_id()
         AND problem_id = $1
         AND id = $2
       RETURNING id`,
      [req.params.id, req.params.knownErrorId],
    );
    if (updated.rows.length === 0) throw NotFound('Known error not found');
    const row = await client.query(
      `${KNOWN_ERROR_SELECT}
       WHERE ke.tenant_id = current_tenant_id() AND ke.id = $1`,
      [updated.rows[0].id],
    );
    res.json(row.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/incidents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const incidentId = req.body?.incident_id;
    const relationshipType = req.body?.relationship_type || 'caused_by';
    if (!incidentId) throw new AppError(400, 'incident_id is required');
    await client.query(
      `INSERT INTO problem_incidents (tenant_id, problem_id, incident_id, relationship_type)
       VALUES (current_tenant_id(), $1, $2, $3)
       ON CONFLICT (tenant_id, problem_id, incident_id) DO UPDATE
       SET relationship_type = EXCLUDED.relationship_type`,
      [req.params.id, incidentId, relationshipType],
    );
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/incidents/:incidentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    await client.query(
      `DELETE FROM problem_incidents
       WHERE tenant_id = current_tenant_id()
         AND problem_id = $1
         AND incident_id = $2`,
      [req.params.id, req.params.incidentId],
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
