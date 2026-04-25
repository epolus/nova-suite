/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Incident Routes (Fulfiller Backend) ───
// GET    /api/incidents              – list incidents
// POST   /api/incidents              – create incident
// GET    /api/incidents/:id          – get incident
// PATCH  /api/incidents/:id          – update incident
// GET    /api/incidents/:id/journal  – get journal entries
// POST   /api/incidents/:id/journal  – add journal entry

import { Router, Request, Response, NextFunction } from 'express';
import {
  authenticate,
  requireRole,
  getRequestClient,
  setTenantRLS,
  releaseTenantClient,
} from '../../middleware/auth';
import { validateBody, validateQuery } from '../../middleware/validate';
import {
  createIncidentSchema,
  updateIncidentSchema,
  addJournalEntrySchema,
  paginationSchema,
  rankedSuggestionsQuerySchema,
} from '../../domain/schemas';
import { AppError, NotFound } from '../../middleware/errorHandler';
import {
  startIncidentEscalation,
  signalIncidentResolved,
  startIncidentAutoClose,
  cancelIncidentAutoClose,
  startNotificationDispatch,
} from '../../temporal/workflows';
import { isFulfillerRole } from '../roles';

const router = Router();

function normalizeGroupName(name: string): string {
  return name.toLowerCase().replace(/[\s_-]/g, '');
}

function endUserIncidentVisibilityCondition(userParamRef: string): string {
  return `(i.caller_id = ${userParamRef} OR EXISTS (
    SELECT 1
    FROM incident_journal j
    WHERE j.incident_id = i.id
      AND j.author_id = ${userParamRef}
      AND j.entry_type = 'state_change'
      AND j.content LIKE 'Incident created with priority%'
  ))`;
}

// All incident routes require auth + tenant context
router.use(authenticate, setTenantRLS, releaseTenantClient);

// ─── GET /api/incidents/services ─── (list services for dropdowns)
router.get('/services', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(
      `SELECT id, name, description FROM services WHERE is_active = true ORDER BY name`,
    );
    res.json({ services: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/incidents/callers ─── (list callers for incident submit)
router.get('/callers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(
      `SELECT u.id, u.email, u.display_name, u.user_id, u.phone, u.mobile,
              COALESCE(
                array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL),
                ARRAY[]::text[]
              ) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.is_active = true
       GROUP BY u.id
       ORDER BY u.display_name`,
    );
    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/incidents ───
router.get(
  '/',
  validateQuery(paginationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { page, limit } = req.query as any;
      const offset = (page - 1) * limit;

      // Build dynamic filters
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 0;

      // Non-fulfiller users can see their own incidents and incidents they submitted.
      const isFulfiller = isFulfillerRole(req);
      if (!isFulfiller) {
        paramIdx++;
        const userParamRef = `$${paramIdx}`;
        conditions.push(endUserIncidentVisibilityCondition(userParamRef));
        params.push(req.user!.id);
      }

      // "My Todo" / "My Groups" filters auto-exclude closed statuses unless explicit status is set
      const isTodoFilter = req.query.assigned_to_me === 'true' || req.query.my_groups === 'true';

      if (req.query.status) {
        paramIdx++;
        conditions.push(`i.status = $${paramIdx}`);
        params.push(req.query.status);
      } else if (req.query.status_not_in) {
        const excluded = String(req.query.status_not_in)
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (excluded.length > 0) {
          const placeholders = excluded.map(() => {
            paramIdx++;
            return `$${paramIdx}`;
          });
          conditions.push(`i.status NOT IN (${placeholders.join(', ')})`);
          params.push(...excluded);
        }
      } else if (req.query.status_ne) {
        paramIdx++;
        conditions.push(`i.status != $${paramIdx}`);
        params.push(req.query.status_ne);
      } else if (isTodoFilter) {
        conditions.push(`i.status NOT IN ('resolved', 'closed', 'cancelled')`);
      }

      if (req.query.assigned_to_me === 'true') {
        paramIdx++;
        conditions.push(`i.assigned_to = $${paramIdx}`);
        params.push(req.user!.id);
      } else if (req.query.assigned_to) {
        paramIdx++;
        conditions.push(`i.assigned_to = $${paramIdx}`);
        params.push(req.query.assigned_to);
      }

      if (req.query.my_groups === 'true') {
        paramIdx++;
        conditions.push(
          `i.assignment_group_id IN (SELECT group_id FROM assignment_group_members WHERE user_id = $${paramIdx})`,
        );
        params.push(req.user!.id);
      }
      if (req.query.priority) {
        paramIdx++;
        conditions.push(`i.priority = $${paramIdx}`);
        params.push(parseInt(req.query.priority as string, 10));
      }
      if (req.query.sla_breached === 'true') {
        conditions.push('i.sla_breached = true');
      }
      if (req.query.search) {
        paramIdx++;
        conditions.push(`(i.number ILIKE $${paramIdx} OR i.title ILIKE $${paramIdx} OR i.description ILIKE $${paramIdx} OR i.category ILIKE $${paramIdx})`);
        params.push(`%${req.query.search}%`);
      }

      // Per-column "starts with" filters (cf.column=value)
      const cfMap: Record<string, string> = {
        number: 'i.number', title: 'i.title', status: 'i.status::text',
        priority: 'i.priority::text', category: 'i.category',
        assigned_to_name: 'a.display_name', caller_name: 'c.display_name',
        assignment_group_name: 'ag.name', service_name: 'svc.name',
        impact: 'i.impact::text', urgency: 'i.urgency::text',
      };
      for (const [qKey, qVal] of Object.entries(req.query)) {
        if (typeof qKey === 'string' && qKey.startsWith('cf.') && typeof qVal === 'string' && qVal) {
          const col = cfMap[qKey.slice(3)];
          if (col) {
            paramIdx++;
            conditions.push(`${col} ILIKE $${paramIdx}`);
            params.push(`${qVal}%`);
          }
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await client.query(
        `SELECT count(*) FROM incidents i
         LEFT JOIN users a ON a.id = i.assigned_to
         LEFT JOIN users c ON c.id = i.caller_id
         LEFT JOIN assignment_groups ag ON ag.id = i.assignment_group_id
         LEFT JOIN services svc ON svc.id = i.service_id
         ${whereClause}`,
        params,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      // Sorting
      const allowedSortCols: Record<string, string> = {
        number: 'i.number',
        title: 'i.title',
        priority: 'i.priority',
        status: 'i.status',
        assigned_to_name: 'a.display_name',
        assignment_group_name: 'ag.name',
        created_at: 'i.created_at',
        updated_at: 'i.updated_at',
        sla_due_at: 'i.sla_due_at',
        impact: 'i.impact',
        urgency: 'i.urgency',
        category: 'i.category',
      };
      const sortCol = allowedSortCols[req.query.sort_by as string];
      const sortDir = req.query.sort_dir === 'desc' ? 'DESC' : 'ASC';
      const orderClause = sortCol
        ? `ORDER BY ${sortCol} ${sortDir}`
        : 'ORDER BY i.created_at DESC';

      paramIdx++;
      params.push(limit);
      paramIdx++;
      params.push(offset);

      const result = await client.query(
        `SELECT i.*,
                a.display_name AS assigned_to_name,
                c.display_name AS caller_name,
                ag.name AS assignment_group_name,
                svc.name AS service_name
         FROM incidents i
         LEFT JOIN users a ON a.id = i.assigned_to
         LEFT JOIN users c ON c.id = i.caller_id
         LEFT JOIN assignment_groups ag ON ag.id = i.assignment_group_id
         LEFT JOIN services svc ON svc.id = i.service_id
         ${whereClause}
         ${orderClause}
         LIMIT $${paramIdx - 1} OFFSET $${paramIdx}`,
        params,
      );

      res.json({
        incidents: result.rows,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/incidents ───
router.post(
  '/',
  requireRole('admin', 'fulfiller'),
  validateBody(createIncidentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const {
        title, description, impact, urgency,
        assigned_to, assignment_group_id, caller_id,
        contact_info, service_id, configuration_item_id,
        category, subcategory, request_id,
      } = req.body;

      if (!assignment_group_id) {
        throw new AppError(400, 'assignment_group_id is required');
      }

      // Calculate priority from matrix
      const priorityResult = await client.query(
        'SELECT calculate_priority($1, $2) AS priority',
        [impact, urgency],
      );
      const priority = priorityResult.rows[0]?.priority || 3;

      // Generate number
      const seqResult = await client.query("SELECT nextval('incident_number_seq')");
      const number = `INC${seqResult.rows[0].nextval.toString().padStart(7, '0')}`;

      // Default SLA: priority-based hours
      const slaHoursMap: Record<number, number> = { 1: 4, 2: 8, 3: 24, 4: 48, 5: 72 };
      const slaDueAt = new Date();
      slaDueAt.setHours(slaDueAt.getHours() + (slaHoursMap[priority] || 24));

      const result = await client.query(
        `INSERT INTO incidents (
          tenant_id, number, request_id, title, description,
          status, impact, urgency, priority,
          assigned_to, assignment_group_id, caller_id,
          contact_info, service_id, configuration_item_id,
          category, subcategory, sla_due_at
        ) VALUES (
          current_tenant_id(), $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11,
          $12, $13, $14,
          $15, $16, $17
        ) RETURNING *`,
        [
          number, request_id || null, title, description || null,
          'new', impact, urgency, priority,
          assigned_to || null, assignment_group_id || null, caller_id || null,
          contact_info || null, service_id || null, configuration_item_id || null,
          category || null, subcategory || null, slaDueAt.toISOString(),
        ],
      );

      // Add creation journal entry
      await client.query(
        `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
         VALUES (current_tenant_id(), $1, $2, 'state_change', $3)`,
        [result.rows[0].id, req.user!.id, `Incident created with priority ${priority}`],
      );

      // Fire-and-forget: start SLA escalation workflow
      startIncidentEscalation({
        incidentId: result.rows[0].id,
        tenantId: req.user!.tenant_id,
        priority,
        slaDueAt: slaDueAt.toISOString(),
      }).catch(() => {});

      startNotificationDispatch({
        tenantId: req.user!.tenant_id,
        entityType: 'incident',
        triggerKey: 'incident.created',
        entityId: result.rows[0].id,
        actorUserId: req.user!.id,
      }).catch(() => {});

      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/incidents/ess ─── (ESS-only simplified submit)
router.post(
  '/ess',
  requireRole('admin', 'fulfiller', 'user'),
  validateBody(createIncidentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (isFulfillerRole(req)) {
        throw new AppError(403, 'Use /api/incidents for agent incident creation');
      }

      const client = getRequestClient(req);
      const {
        title, description, impact, urgency,
        caller_id, contact_info, request_id,
      } = req.body;

      const groups = await client.query(
        `SELECT id, name
         FROM assignment_groups
         WHERE is_active = true
         ORDER BY name`,
      );
      const serviceDesk = groups.rows.find(
        (g: { id: string; name: string }) => normalizeGroupName(g.name) === 'servicedesk',
      );
      if (!serviceDesk) {
        throw new AppError(400, 'Service Desk assignment group not found');
      }

      // Calculate priority from matrix
      const priorityResult = await client.query(
        'SELECT calculate_priority($1, $2) AS priority',
        [impact, urgency],
      );
      const priority = priorityResult.rows[0]?.priority || 3;

      // Generate number
      const seqResult = await client.query("SELECT nextval('incident_number_seq')");
      const number = `INC${seqResult.rows[0].nextval.toString().padStart(7, '0')}`;

      // Default SLA: priority-based hours
      const slaHoursMap: Record<number, number> = { 1: 4, 2: 8, 3: 24, 4: 48, 5: 72 };
      const slaDueAt = new Date();
      slaDueAt.setHours(slaDueAt.getHours() + (slaHoursMap[priority] || 24));

      const result = await client.query(
        `INSERT INTO incidents (
          tenant_id, number, request_id, title, description,
          status, impact, urgency, priority,
          assigned_to, assignment_group_id, caller_id,
          contact_info, service_id, configuration_item_id,
          category, subcategory, sla_due_at
        ) VALUES (
          current_tenant_id(), $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11,
          $12, $13, $14,
          $15, $16, $17
        ) RETURNING *`,
        [
          number, request_id || null, title, description || null,
          'new', impact, urgency, priority,
          null, serviceDesk.id, caller_id || req.user!.id,
          contact_info || null, null, null,
          null, null, slaDueAt.toISOString(),
        ],
      );

      await client.query(
        `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
         VALUES (current_tenant_id(), $1, $2, 'state_change', $3)`,
        [result.rows[0].id, req.user!.id, `Incident created with priority ${priority}`],
      );

      startIncidentEscalation({
        incidentId: result.rows[0].id,
        tenantId: req.user!.tenant_id,
        priority,
        slaDueAt: slaDueAt.toISOString(),
      }).catch(() => {});

      startNotificationDispatch({
        tenantId: req.user!.tenant_id,
        entityType: 'incident',
        triggerKey: 'incident.created',
        entityId: result.rows[0].id,
        actorUserId: req.user!.id,
      }).catch(() => {});

      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/incidents/stats ───
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const isFulfiller = isFulfillerRole(req);

    if (!isFulfiller) {
      // End users: just their own open incident count
      const r = await client.query(
        `SELECT COUNT(*) FILTER (WHERE status NOT IN ('closed','cancelled')) AS open_total
         FROM incidents WHERE caller_id = $1`,
        [req.user!.id],
      );
      res.json({ open_total: parseInt(r.rows[0].open_total, 10), sla_breached: 0, assigned_to_me: 0, by_priority: [] });
      return;
    }

    const r = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('closed','cancelled'))::int AS open_total,
         COUNT(*) FILTER (WHERE sla_breached = true AND status NOT IN ('closed','cancelled'))::int AS sla_breached,
         COUNT(*) FILTER (WHERE assigned_to = $1 AND status NOT IN ('resolved','closed','cancelled'))::int AS assigned_to_me,
         COUNT(*) FILTER (WHERE priority = 1 AND status NOT IN ('closed','cancelled'))::int AS p1,
         COUNT(*) FILTER (WHERE priority = 2 AND status NOT IN ('closed','cancelled'))::int AS p2,
         COUNT(*) FILTER (WHERE priority = 3 AND status NOT IN ('closed','cancelled'))::int AS p3,
         COUNT(*) FILTER (WHERE priority = 4 AND status NOT IN ('closed','cancelled'))::int AS p4,
         COUNT(*) FILTER (WHERE priority = 5 AND status NOT IN ('closed','cancelled'))::int AS p5
       FROM incidents`,
      [req.user!.id],
    );
    const row = r.rows[0];
    res.json({
      open_total: row.open_total,
      sla_breached: row.sla_breached,
      assigned_to_me: row.assigned_to_me,
      by_priority: [
        { priority: 1, label: 'P1 Critical', count: row.p1 },
        { priority: 2, label: 'P2 High', count: row.p2 },
        { priority: 3, label: 'P3 Moderate', count: row.p3 },
        { priority: 4, label: 'P4 Low', count: row.p4 },
        { priority: 5, label: 'P5 Planning', count: row.p5 },
      ],
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/incidents/assignment-groups ───
router.get('/assignment-groups', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(
      `SELECT ag.id, ag.name, ag.description, ag.is_active
       FROM assignment_groups ag
       WHERE ag.is_active = true
       ORDER BY ag.name`,
    );
    res.json({ assignment_groups: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/incidents/bulk ───
router.patch(
  '/bulk',
  requireRole('admin', 'fulfiller'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { ids, action, value } = req.body as { ids: string[]; action: string; value?: string };
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids array is required' }); return;
      }
      if (action === 'close') {
        await client.query(
          `UPDATE incidents SET status = 'closed', closed_at = NOW(), updated_at = NOW()
           WHERE id = ANY($1::uuid[]) AND status NOT IN ('closed', 'cancelled')`,
          [ids],
        );
      } else if (action === 'assign_group') {
        await client.query(
          `UPDATE incidents SET assignment_group_id = $1, updated_at = NOW()
           WHERE id = ANY($2::uuid[]) AND status NOT IN ('closed', 'cancelled')`,
          [value || null, ids],
        );
      } else {
        res.status(400).json({ error: 'Unknown action' }); return;
      }
      res.json({ success: true, updated: ids.length });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/incidents/nav ─── (prev/next navigation)
router.get('/nav', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const currentId = req.query.current as string;
    if (!currentId) {
      res.json({ prev_id: null, next_id: null });
      return;
    }

    // Rebuild the same filter set from the list page
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 0;

    // Non-fulfiller users can navigate their own incidents and incidents they submitted.
    const isFulfiller = isFulfillerRole(req);
    if (!isFulfiller) {
      paramIdx++;
      const userParamRef = `$${paramIdx}`;
      conditions.push(endUserIncidentVisibilityCondition(userParamRef));
      params.push(req.user!.id);
    }

    const isTodoFilter = req.query.assigned_to_me === 'true' || req.query.my_groups === 'true';

    if (req.query.status) {
      paramIdx++;
      conditions.push(`i.status = $${paramIdx}`);
      params.push(req.query.status);
    } else if (req.query.status_not_in) {
      const excluded = String(req.query.status_not_in)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (excluded.length > 0) {
        const placeholders = excluded.map(() => {
          paramIdx++;
          return `$${paramIdx}`;
        });
        conditions.push(`i.status NOT IN (${placeholders.join(', ')})`);
        params.push(...excluded);
      }
    } else if (req.query.status_ne) {
      paramIdx++;
      conditions.push(`i.status <> $${paramIdx}`);
      params.push(req.query.status_ne);
    } else if (isTodoFilter) {
      conditions.push(`i.status NOT IN ('resolved', 'closed', 'cancelled')`);
    }
    if (req.query.assigned_to_me === 'true') {
      paramIdx++;
      conditions.push(`i.assigned_to = $${paramIdx}`);
      params.push(req.user!.id);
    } else if (req.query.assigned_to) {
      paramIdx++;
      conditions.push(`i.assigned_to = $${paramIdx}`);
      params.push(req.query.assigned_to);
    }
    if (req.query.my_groups === 'true') {
      paramIdx++;
      conditions.push(
        `i.assignment_group_id IN (SELECT group_id FROM assignment_group_members WHERE user_id = $${paramIdx})`,
      );
      params.push(req.user!.id);
    }
    if (req.query.priority) {
      paramIdx++;
      conditions.push(`i.priority = $${paramIdx}`);
      params.push(parseInt(req.query.priority as string, 10));
    }
    if (req.query.sla_breached === 'true') {
      conditions.push('i.sla_breached = true');
    }
    if (req.query.search) {
      paramIdx++;
      conditions.push(`(i.number ILIKE $${paramIdx} OR i.title ILIKE $${paramIdx} OR i.description ILIKE $${paramIdx} OR i.category ILIKE $${paramIdx})`);
      params.push(`%${req.query.search}%`);
    }

    // Per-column "starts with" filters (cf.column=value)
    const cfMap: Record<string, string> = {
      number: 'i.number', title: 'i.title', status: 'i.status::text',
      priority: 'i.priority::text', category: 'i.category',
      assigned_to_name: 'a.display_name', caller_name: 'c.display_name',
      assignment_group_name: 'ag.name', service_name: 'svc.name',
      impact: 'i.impact::text', urgency: 'i.urgency::text',
    };
    for (const [qKey, qVal] of Object.entries(req.query)) {
      if (typeof qKey === 'string' && qKey.startsWith('cf.') && typeof qVal === 'string' && qVal) {
        const col = cfMap[qKey.slice(3)];
        if (col) {
          paramIdx++;
          conditions.push(`${col} ILIKE $${paramIdx}`);
          params.push(`${qVal}%`);
        }
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const allowedSortCols: Record<string, string> = {
      number: 'i.number',
      title: 'i.title',
      priority: 'i.priority',
      status: 'i.status',
      assigned_to_name: 'a.display_name',
      assignment_group_name: 'ag.name',
      created_at: 'i.created_at',
      updated_at: 'i.updated_at',
      sla_due_at: 'i.sla_due_at',
      impact: 'i.impact',
      urgency: 'i.urgency',
      category: 'i.category',
    };
    const sortCol = allowedSortCols[req.query.sort_by as string];
    const sortDir = req.query.sort_dir === 'desc' ? 'DESC' : 'ASC';
    const orderClause = sortCol
      ? `ORDER BY ${sortCol} ${sortDir}`
      : 'ORDER BY i.created_at DESC';

    // Get the ordered list of IDs matching filters
    const result = await client.query(
      `SELECT i.id
       FROM incidents i
       LEFT JOIN users a ON a.id = i.assigned_to
       LEFT JOIN users c ON c.id = i.caller_id
       LEFT JOIN assignment_groups ag ON ag.id = i.assignment_group_id
       LEFT JOIN services svc ON svc.id = i.service_id
       ${whereClause}
       ${orderClause}`,
      params,
    );

    const ids: string[] = result.rows.map((r: { id: string }) => r.id);
    const currentIndex = ids.indexOf(currentId);

    res.json({
      prev_id: currentIndex > 0 ? ids[currentIndex - 1] : null,
      next_id: currentIndex >= 0 && currentIndex < ids.length - 1 ? ids[currentIndex + 1] : null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/incidents/:id/similar ───
router.get(
  '/:id/similar',
  validateQuery(rankedSuggestionsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const incidentId = String(req.params.id);
      const limit = Number((req.query as Record<string, unknown>).limit ?? 5);

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
      const isFulfiller = isFulfillerRole(req);
      if (!isFulfiller && current.caller_id !== req.user!.id) {
        const submitterResult = await client.query(
          `SELECT 1
           FROM incident_journal j
           WHERE j.incident_id = $1
             AND j.author_id = $2
             AND j.entry_type = 'state_change'
             AND j.content LIKE 'Incident created with priority%'
           LIMIT 1`,
          [incidentId, req.user!.id],
        );
        if (submitterResult.rows.length === 0) {
          res.status(403).json({ error: 'Insufficient permissions' });
          return;
        }
      }

      const visibilityClause = isFulfiller ? '' : `AND ${endUserIncidentVisibilityCondition('$2')}`;
      const params: unknown[] = isFulfiller ? [incidentId, limit] : [incidentId, req.user!.id, limit];
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

      res.json({ incidents: similarResult.rows });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/incidents/similar-by-text ───
router.get('/similar-by-text', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const title = String((req.query as Record<string, unknown>).title ?? '');
    const description = String((req.query as Record<string, unknown>).description ?? '');
    const limit = Math.min(Number((req.query as Record<string, unknown>).limit ?? 6), 20);

    const isFulfiller = isFulfillerRole(req);

    const visibilityClause = isFulfiller ? '' : 'AND i.caller_id = $3::uuid';
    const params: unknown[] = isFulfiller ? [title, description, limit] : [title, description, req.user!.id, limit];
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

    res.json({ incidents: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/incidents/:id ───
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(
      `SELECT i.*,
              a.display_name AS assigned_to_name,
              c.display_name AS caller_name,
              c.email AS caller_email,
              c.phone AS caller_phone,
              c.mobile AS caller_mobile,
              cd.name AS caller_department_name,
              ci.name AS ci_name,
              ci.display_name AS ci_display_name,
              ag.name AS assignment_group_name,
              svc.name AS service_name
       FROM incidents i
       LEFT JOIN users a ON a.id = i.assigned_to
       LEFT JOIN users c ON c.id = i.caller_id
       LEFT JOIN departments cd ON cd.id = c.department_id
       LEFT JOIN configuration_items ci ON ci.id = i.configuration_item_id
       LEFT JOIN assignment_groups ag ON ag.id = i.assignment_group_id
       LEFT JOIN services svc ON svc.id = i.service_id
       WHERE i.id = $1`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      throw NotFound('Incident not found');
    }

    const incident = result.rows[0];
    const isFulfiller = isFulfillerRole(req);
    if (!isFulfiller && incident.caller_id !== req.user!.id) {
      const submitterResult = await client.query(
        `SELECT 1
         FROM incident_journal j
         WHERE j.incident_id = $1
           AND j.author_id = $2
           AND j.entry_type = 'state_change'
           AND j.content LIKE 'Incident created with priority%'
         LIMIT 1`,
        [req.params.id, req.user!.id],
      );
      if (submitterResult.rows.length === 0) {
        res.status(403).json({ error: 'Insufficient permissions' }); return;
      }
    }

    res.json(incident);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/incidents/:id ───
router.patch(
  '/:id',
  validateBody(updateIncidentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const incidentId = req.params.id;

      // Get current incident
      const existing = await client.query('SELECT * FROM incidents WHERE id = $1', [incidentId]);
      if (existing.rows.length === 0) {
        throw NotFound('Incident not found');
      }

      const current = existing.rows[0];
      const updates = req.body;
      const isFulfiller = isFulfillerRole(req);
      const isCaller = current.caller_id === req.user!.id;

      if (!isFulfiller) {
        if (!isCaller) {
          res.status(403).json({ error: 'Insufficient permissions' }); return;
        }
        const allowedKeys = Object.keys(updates);
        const isReopenOnly = allowedKeys.length === 1 && allowedKeys[0] === 'status'
          && updates.status === 'in_progress' && current.status === 'resolved';
        const isCancelOnly = allowedKeys.length === 1 && allowedKeys[0] === 'status'
          && updates.status === 'cancelled'
          && !['closed', 'cancelled'].includes(current.status);
        if (!isReopenOnly && !isCancelOnly) {
          res.status(403).json({ error: 'You can only reopen resolved incidents or cancel your own open incidents' }); return;
        }
      }

      // Status automation
      if (updates.assignment_group_id !== undefined
        && updates.assignment_group_id !== current.assignment_group_id
        && updates.status === undefined
        && !['resolved', 'closed', 'cancelled'].includes(current.status)) {
        updates.status = 'assigned';
      }

      if (typeof updates.resolution_notes === 'string'
        && updates.resolution_notes.trim().length > 0
        && updates.status === undefined
        && !['resolved', 'closed', 'cancelled'].includes(current.status)) {
        updates.status = 'resolved';
      }

      // Pending requires a reason (stored in resolution_code as pending reason).
      if (updates.status === 'pending') {
        const pendingReason = typeof updates.resolution_code === 'string'
          ? updates.resolution_code
          : current.resolution_code;
        if (!pendingReason || String(pendingReason).trim().length === 0) {
          res.status(400).json({ error: 'Pending reason is required when setting status to pending' });
          return;
        }
      }

      // Resolved requires solution notes.
      if (updates.status === 'resolved') {
        const resolutionText = typeof updates.resolution_notes === 'string'
          ? updates.resolution_notes
          : current.resolution_notes;
        if (!resolutionText || String(resolutionText).trim().length === 0) {
          res.status(400).json({ error: 'Resolution notes are required when setting status to resolved' });
          return;
        }
      }

      // Recalculate priority if impact or urgency changed
      if (updates.impact || updates.urgency) {
        const impact = updates.impact || current.impact;
        const urgency = updates.urgency || current.urgency;
        const priorityResult = await client.query(
          'SELECT calculate_priority($1, $2) AS priority',
          [impact, urgency],
        );
        updates.priority = priorityResult.rows[0]?.priority || current.priority;
      }

      // Handle resolution
      if (updates.status === 'resolved' && !current.resolved_at) {
        updates.resolved_at = new Date().toISOString();
      }
      if (updates.status && updates.status !== 'resolved' && current.status === 'resolved') {
        updates.resolved_at = null;
      }
      if (updates.status === 'closed' && !current.closed_at) {
        updates.closed_at = new Date().toISOString();
      }

      // Build dynamic UPDATE
      const setClauses: string[] = [];
      const params: unknown[] = [];
      let idx = 0;

      for (const [key, value] of Object.entries(updates)) {
        idx++;
        setClauses.push(`${key} = $${idx}`);
        params.push(value);
      }

      if (setClauses.length === 0) {
        res.json(current);
        return;
      }

      idx++;
      params.push(incidentId);

      const result = await client.query(
        `UPDATE incidents SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
        params,
      );

      // Journal entries for key changes
      if (updates.status && updates.status !== current.status) {
        await client.query(
          `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
           VALUES (current_tenant_id(), $1, $2, 'state_change', $3)`,
          [incidentId, req.user!.id, `Status changed from ${current.status} to ${updates.status}`],
        );

        // Signal escalation workflow when incident is resolved/closed/cancelled
        if (['resolved', 'closed', 'cancelled'].includes(updates.status)) {
          signalIncidentResolved(incidentId as string).catch(() => {});
        }

        if (updates.status === 'resolved') {
          startNotificationDispatch({
            tenantId: req.user!.tenant_id,
            entityType: 'incident',
            triggerKey: 'incident.resolved',
            entityId: incidentId as string,
            actorUserId: req.user!.id,
          }).catch(() => {});
        }

        // Start/reset auto-close timer when resolved; cancel when leaving resolved.
        if (updates.status === 'resolved') {
          const effectivePriority = updates.priority ?? current.priority;
          const effectiveImpact = updates.impact ?? current.impact;
          const effectiveUrgency = updates.urgency ?? current.urgency;
          const effectiveCategory = updates.category ?? current.category;
          const effectiveServiceId = updates.service_id ?? current.service_id;

          // Select the most specific matching active incident SLA by sort order.
          const autoCloseCfg = await client.query(
            `SELECT auto_close_days
             FROM sla_definitions sd
             WHERE sd.process_type = 'incident'
               AND sd.is_active = true
               AND (sd.condition_priority IS NULL OR sd.condition_priority = $1)
               AND (sd.condition_impact IS NULL OR sd.condition_impact = $2)
               AND (sd.condition_urgency IS NULL OR sd.condition_urgency = $3)
               AND (sd.condition_category IS NULL OR sd.condition_category = $4)
               AND (sd.condition_service_id IS NULL OR sd.condition_service_id = $5)
             ORDER BY sd.sort_order ASC, sd.name ASC
             LIMIT 1`,
            [effectivePriority, effectiveImpact, effectiveUrgency, effectiveCategory, effectiveServiceId],
          );
          const autoCloseDays = Number(autoCloseCfg.rows[0]?.auto_close_days ?? 7);

          startIncidentAutoClose({
            incidentId: incidentId as string,
            tenantId: req.user!.tenant_id,
            autoCloseAfterDays: autoCloseDays > 0 ? autoCloseDays : 7,
          }).catch(() => {});
        } else if (current.status === 'resolved') {
          cancelIncidentAutoClose(incidentId as string).catch(() => {});
        }
      }
      if (updates.assigned_to && updates.assigned_to !== current.assigned_to) {
        // Look up new assignee display name
        const assigneeRow = await client.query(
          `SELECT display_name FROM users WHERE id = $1 LIMIT 1`,
          [updates.assigned_to],
        );
        const assigneeName = assigneeRow.rows[0]?.display_name ?? 'you';
        await client.query(
          `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
           VALUES (current_tenant_id(), $1, $2, 'assignment', $3)`,
          [incidentId, req.user!.id, `Assigned to ${assigneeName}`],
        );
        startNotificationDispatch({
          tenantId: req.user!.tenant_id,
          entityType: 'incident',
          triggerKey: 'incident.assigned',
          entityId: incidentId as string,
          actorUserId: req.user!.id,
        }).catch(() => {});
      }

      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/incidents/:id/journal ───
router.get('/:id/journal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(
      `SELECT j.*, u.display_name AS author_name
       FROM incident_journal j
       JOIN users u ON u.id = j.author_id
       WHERE j.incident_id = $1
       ORDER BY j.created_at DESC`,
      [req.params.id],
    );

    res.json({ entries: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/incidents/:id/journal ───
router.post(
  '/:id/journal',
  validateBody(addJournalEntrySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { entry_type, content, is_customer_visible } = req.body;

      // Verify incident exists and check permissions
      const incident = await client.query(
        `SELECT id, caller_id, number, title, status, resolution_code, assigned_to, assignment_group_id
         FROM incidents
         WHERE id = $1`,
        [req.params.id],
      );
      if (incident.rows.length === 0) {
        throw NotFound('Incident not found');
      }

      const isFulfiller = isFulfillerRole(req);
      const isCaller = incident.rows[0].caller_id === req.user!.id;
      if (!isFulfiller && !isCaller) {
        res.status(403).json({ error: 'Insufficient permissions' }); return;
      }

      const result = await client.query(
        `INSERT INTO incident_journal (
          tenant_id, incident_id, author_id, entry_type, content, is_customer_visible
        ) VALUES (
          current_tenant_id(), $1, $2, $3, $4, $5
        ) RETURNING *`,
        [req.params.id, req.user!.id, entry_type, content, is_customer_visible],
      );

      if (entry_type !== 'state_change') {
        startNotificationDispatch({
          tenantId: req.user!.tenant_id,
          entityType: 'incident',
          triggerKey: 'incident.commented',
          entityId: String(req.params.id),
          actorUserId: req.user!.id,
        }).catch(() => {});
      }

      // Customer replied while waiting for caller response:
      // move incident back to in_progress and notify current owner.
      if (
        !isFulfiller
        && isCaller
        && entry_type !== 'state_change'
        && incident.rows[0].status === 'pending'
        && incident.rows[0].resolution_code === 'waiting_for_caller'
      ) {
        await client.query(
          `UPDATE incidents
           SET status = 'in_progress', resolution_code = NULL, updated_at = now()
           WHERE id = $1`,
          [req.params.id],
        );
        await client.query(
          `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
           VALUES (current_tenant_id(), $1, $2, 'state_change', $3)`,
          [
            req.params.id,
            req.user!.id,
            'Status changed from pending to in_progress after caller response',
          ],
        );

        const assignedTo = incident.rows[0].assigned_to as string | null;
        const assignmentGroupId = incident.rows[0].assignment_group_id as string | null;
        const notifyTitle = `${incident.rows[0].number}: caller responded`;
        const notifyBody = `${incident.rows[0].title}: customer added an update. Status moved to in_progress.`;

        if (assignedTo && assignedTo !== req.user!.id) {
          await client.query(
            `INSERT INTO notifications (tenant_id, user_id, type, title, body, entity_type, entity_id)
             VALUES (current_tenant_id(), $1, 'assignment', $2, $3, 'incident', $4)`,
            [assignedTo, notifyTitle, notifyBody, req.params.id],
          );
        } else if (assignmentGroupId) {
          await client.query(
            `INSERT INTO notifications (tenant_id, user_id, type, title, body, entity_type, entity_id)
             SELECT current_tenant_id(), agm.user_id, 'assignment', $2, $3, 'incident', $4
             FROM assignment_group_members agm
             WHERE agm.group_id = $1
               AND agm.user_id <> $5`,
            [assignmentGroupId, notifyTitle, notifyBody, req.params.id, req.user!.id],
          );
        }
      }

      // Detect @mentions and notify mentioned users
      const mentionMatches = content.match(/@([\w.\- ]+)/g);
      if (mentionMatches && mentionMatches.length > 0) {
        const names = [...new Set(mentionMatches.map((m: string) => m.slice(1).trim()))];
        for (const name of names) {
          const mentionedUser = await client.query(
            `SELECT id FROM users WHERE lower(display_name) = lower($1) LIMIT 1`,
            [name],
          );
          if (mentionedUser.rows.length > 0 && mentionedUser.rows[0].id !== req.user!.id) {
            await client.query(
              `INSERT INTO notifications (tenant_id, user_id, type, title, body, entity_type, entity_id)
               VALUES (current_tenant_id(), $1, 'mention', $2, $3, 'incident', $4)`,
              [
                mentionedUser.rows[0].id,
                `You were mentioned in a journal entry`,
                `${incident.rows[0].number}: ${incident.rows[0].title}`,
                req.params.id,
              ],
            );
          }
        }
      }

      // Work note means active processing has started.
      if (entry_type === 'work_note') {
        const current = await client.query(
          `SELECT status FROM incidents WHERE id = $1`,
          [req.params.id],
        );
        const status = current.rows[0]?.status as string | undefined;
        if (status && !['in_progress', 'resolved', 'closed', 'cancelled'].includes(status)) {
          await client.query(
            `UPDATE incidents
             SET status = 'in_progress'
             WHERE id = $1`,
            [req.params.id],
          );
          await client.query(
            `INSERT INTO incident_journal (tenant_id, incident_id, author_id, entry_type, content)
             VALUES (current_tenant_id(), $1, $2, 'state_change', $3)`,
            [req.params.id, req.user!.id, `Status changed from ${status} to in_progress`],
          );
        }
      }

      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
