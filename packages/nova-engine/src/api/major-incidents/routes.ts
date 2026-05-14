/* SPDX-License-Identifier: AGPL-3.0-only */
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
  createMajorIncidentSchema,
  updateMajorIncidentSchema,
  majorIncidentStakeholderUpdateSchema,
  majorIncidentRoleSchema,
  majorIncidentRelatedSchema,
  postmortemUpsertSchema,
  publishPostmortemSchema,
  majorIncidentListQuerySchema,
  majorIncidentResolveSchema,
} from '../../domain/schemas';
import type { CreateMajorIncidentInput } from '../../domain/schemas';
import { NotFound } from '../../middleware/errorHandler';
import {
  signalMajorIncidentDeclareResolved,
  signalMajorIncidentStakeholderUpdate,
  signalPostmortemPublished,
  queryMajorIncidentWorkflowStatus,
} from '../../temporal/workflows';
import { enqueueMajorIncidentWorkflowStartJob, enqueueNotificationDispatchStartJob } from '../../temporal/workflow-start-queue';
import { hasAnyRole } from '../roles';
import { logger } from '../../logger';

type PgClient = ReturnType<typeof getRequestClient>;

const router = Router();

function routeId(req: Request): string {
  const raw = req.params.id;
  return Array.isArray(raw) ? raw[0]! : String(raw);
}

/** Major incident managers + admins (mutating war room / postmortem). */
const requireMajorIncidentManage = requireRole('admin', 'major_incident_manager');

/**
 * Enqueue notification dispatch on the system DB pool (same pattern as incidents).
 * Do not pass the per-request client: the handler does not await this call, and
 * sharing the request client races `releaseTenantClient` on response finish.
 */
function queueMajorIncidentNotification(
  tenantId: string,
  majorIncidentId: string,
  triggerKey: string,
  actorUserId: string | null,
): void {
  void enqueueNotificationDispatchStartJob({
    tenantId,
    entityType: 'major_incident',
    triggerKey,
    entityId: majorIncidentId,
    actorUserId,
  }).catch((err) => {
    logger.warn(
      { err, tenantId, majorIncidentId, triggerKey },
      'Failed to enqueue major incident notification dispatch job',
    );
  });
}

router.use(
  authenticate,
  requireRole('admin', 'fulfiller', 'major_incident_manager'),
  setTenantRLS,
  releaseTenantClient,
);

async function insertMiEvent(
  client: PgClient,
  tenantId: string,
  majorIncidentId: string,
  eventType: string,
  payload: Record<string, unknown>,
  actorUserId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO major_incident_events (tenant_id, major_incident_id, event_type, payload, actor_user_id)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [tenantId, majorIncidentId, eventType, JSON.stringify(payload), actorUserId],
  );
}

// ─── GET /api/major-incidents/active-banner ───
router.get('/active-banner', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const tenantId = req.user!.tenant_id;
    const r = await client.query(
      `SELECT id, number, title, status, priority, declared_major_at
       FROM major_incidents
       WHERE tenant_id = $1
         AND status IN ('declared', 'investigating', 'monitoring')
         AND priority <= 2
       ORDER BY declared_major_at DESC
       LIMIT 5`,
      [tenantId],
    );
    res.json({ items: r.rows });
    return;
  } catch (err) {
    next(err);
    return;
  }
});

// ─── GET /api/major-incidents ───
router.get(
  '/',
  validateQuery(majorIncidentListQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { page, limit, status, status_not_in, search, sort_by, sort_dir, priority_lte } = req.query as unknown as {
        page: number;
        limit: number;
        status?: string;
        status_not_in?: string;
        search?: string;
        sort_by?: string;
        sort_dir?: string;
        priority_lte?: number;
      };
      const offset = (page - 1) * limit;
      const params: unknown[] = [req.user!.tenant_id];
      const conds: string[] = ['mi.tenant_id = $1'];
      let p = 1;
      if (status) {
        const parts = status.split(',').map((s) => s.trim()).filter(Boolean);
        if (parts.length > 0) {
          const ph = parts.map(() => {
            p += 1;
            return `$${p}`;
          });
          conds.push(`mi.status::text IN (${ph.join(', ')})`);
          params.push(...parts);
        }
      }
      if (status_not_in) {
        const parts = status_not_in.split(',').map((s) => s.trim()).filter(Boolean);
        if (parts.length > 0) {
          const ph = parts.map(() => {
            p += 1;
            return `$${p}`;
          });
          conds.push(`mi.status::text NOT IN (${ph.join(', ')})`);
          params.push(...parts);
        }
      }
      if (search && search.trim()) {
        p += 1;
        conds.push(`(mi.title ILIKE '%' || $${p} || '%' OR mi.number ILIKE '%' || $${p} || '%')`);
        params.push(search.trim());
      }
      if (priority_lte !== undefined) {
        p += 1;
        conds.push(`mi.priority <= $${p}`);
        params.push(priority_lte);
      }
      const sortKey =
        sort_by === 'title' || sort_by === 'status' || sort_by === 'priority' || sort_by === 'declared_major_at' || sort_by === 'number'
          ? sort_by
          : 'declared_major_at';
      const dir = sort_dir === 'asc' ? 'ASC' : 'DESC';
      const orderSql = `mi.${sortKey} ${dir}`;

      p += 1;
      params.push(limit);
      const limitIdx = p;
      p += 1;
      params.push(offset);
      const offsetIdx = p;

      const list = await client.query(
        `SELECT mi.*,
                (SELECT count(*)::int FROM major_incident_participants mp WHERE mp.major_incident_id = mi.id) AS participant_count
         FROM major_incidents mi
         WHERE ${conds.join(' AND ')}
         ORDER BY ${orderSql}
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params,
      );
      const countR = await client.query(
        `SELECT count(*)::int AS c FROM major_incidents mi WHERE ${conds.join(' AND ')}`,
        params.slice(0, params.length - 2),
      );
      const total = (countR.rows[0] as { c: number }).c;
      res.json({ major_incidents: list.rows, page, limit, total });
      return;
    } catch (err) {
      next(err);
      return;
    }
  },
);

// ─── POST /api/major-incidents ───
router.post(
  '/',
  validateBody(createMajorIncidentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const body = req.body as CreateMajorIncidentInput;
      const tenantId = req.user!.tenant_id;
      const userId = req.user!.id;

      let affected = body.affected_service_ids ?? [];
      const primaryId = body.primary_incident_id;
      if (primaryId && affected.length === 0) {
        const inc = await client.query(`SELECT service_id FROM incidents WHERE id = $1`, [primaryId]);
        if (inc.rows[0] && (inc.rows[0] as { service_id: string | null }).service_id) {
          affected = [(inc.rows[0] as { service_id: string }).service_id];
        }
      }

      const awaitingAcceptance = Boolean(primaryId);
      if (!awaitingAcceptance && !hasAnyRole(req, ['admin', 'major_incident_manager'])) {
        return res.status(403).json({ error: 'Only major incident managers can create a standalone major incident' });
      }
      const initialStatus = awaitingAcceptance ? 'pending_acceptance' : 'declared';

      const seqResult = await client.query(`SELECT nextval('major_incident_number_seq') AS nextval`);
      const number = `MI${String((seqResult.rows[0] as { nextval: string | number }).nextval).padStart(7, '0')}`;

      const ins = await client.query(
        `INSERT INTO major_incidents (
           tenant_id, number, title, description, priority, impact, urgency,
           affected_service_ids, created_by, assigned_team_id, primary_incident_id, war_room_channel, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::major_incident_status_enum)
         RETURNING *`,
        [
          tenantId,
          number,
          body.title,
          body.description ?? null,
          body.priority,
          body.impact,
          body.urgency,
          affected,
          userId,
          body.assigned_team_id ?? null,
          primaryId ?? null,
          body.war_room_channel ?? null,
          initialStatus,
        ],
      );
      const row = ins.rows[0] as { id: string; title: string };
      if (primaryId) {
        await client.query(
          `INSERT INTO major_incident_related_incidents (tenant_id, major_incident_id, incident_id, link_reason)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (major_incident_id, incident_id) DO NOTHING`,
          [tenantId, row.id, primaryId, 'Primary incident'],
        );
      }
      await insertMiEvent(
        client,
        tenantId,
        row.id,
        awaitingAcceptance ? 'promotion_requested' : 'created',
        { source: 'api', primary_incident_id: primaryId ?? undefined, awaiting_acceptance: awaitingAcceptance },
        userId,
      );

      if (!awaitingAcceptance) {
        await enqueueMajorIncidentWorkflowStartJob({
          tenantId,
          majorIncidentId: row.id,
          title: row.title,
          queryable: client,
        });
      }

      if (awaitingAcceptance) {
        queueMajorIncidentNotification(tenantId, row.id, 'major_incident.promotion_requested', userId);
      } else {
        queueMajorIncidentNotification(tenantId, row.id, 'major_incident.declared', userId);
      }

      res.status(201).json({ major_incident: ins.rows[0] });
      return;
    } catch (err) {
      next(err);
      return;
    }
  },
);

// ─── POST /api/major-incidents/:id/accept-major ───
router.post('/:id/accept-major', requireMajorIncidentManage, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = routeId(req);
    const tenantId = req.user!.tenant_id;
    const cur = await client.query(
      `SELECT id, status::text AS status, title, primary_incident_id
       FROM major_incidents WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (cur.rows.length === 0) throw NotFound('Major incident not found');
    const row = cur.rows[0] as { status: string; title: string; primary_incident_id: string | null };
    if (row.status !== 'pending_acceptance') {
      return res.status(400).json({ error: 'This major incident is not awaiting acceptance' });
    }
    const upd = await client.query(
      `UPDATE major_incidents
       SET status = 'declared'::major_incident_status_enum, updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND status = 'pending_acceptance'::major_incident_status_enum
       RETURNING *`,
      [id, tenantId],
    );
    if (upd.rows.length === 0) {
      return res.status(409).json({ error: 'Major incident state changed; refresh and try again' });
    }
    await insertMiEvent(client, tenantId, id, 'accepted_as_major', {}, req.user!.id);
    if (row.primary_incident_id) {
      await client.query(
        `INSERT INTO major_incident_related_incidents (tenant_id, major_incident_id, incident_id, link_reason)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (major_incident_id, incident_id) DO NOTHING`,
        [tenantId, id, row.primary_incident_id, 'Primary incident'],
      );
    }
    await enqueueMajorIncidentWorkflowStartJob({
      tenantId,
      majorIncidentId: id,
      title: row.title,
      queryable: client,
    });
    queueMajorIncidentNotification(tenantId, id, 'major_incident.accepted', req.user!.id);
    res.json({ major_incident: upd.rows[0] });
    return;
  } catch (err) {
    next(err);
    return;
  }
});

// ─── POST /api/major-incidents/:id/reject-promotion ───
router.post('/:id/reject-promotion', requireMajorIncidentManage, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = routeId(req);
    const tenantId = req.user!.tenant_id;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 2000) : '';

    const cur = await client.query(
      `SELECT id, status::text AS status FROM major_incidents WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (cur.rows.length === 0) throw NotFound('Major incident not found');
    if ((cur.rows[0] as { status: string }).status !== 'pending_acceptance') {
      return res.status(400).json({ error: 'Only a proposed major incident awaiting acceptance can be rejected' });
    }

    const upd = await client.query(
      `UPDATE major_incidents
       SET status = 'cancelled'::major_incident_status_enum,
           primary_incident_id = NULL,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2 AND status = 'pending_acceptance'::major_incident_status_enum
       RETURNING *`,
      [id, tenantId],
    );
    if (upd.rows.length === 0) {
      return res.status(409).json({ error: 'Major incident state changed; refresh and try again' });
    }

    await insertMiEvent(client, tenantId, id, 'promotion_rejected', { reason: reason || undefined }, req.user!.id);
    res.json({ major_incident: upd.rows[0] });
    return;
  } catch (err) {
    next(err);
    return;
  }
});

// ─── GET /api/major-incidents/:id ───
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = routeId(req);
    const tenantId = req.user!.tenant_id;
    const mi = await client.query(`SELECT * FROM major_incidents WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (mi.rows.length === 0) throw NotFound('Major incident not found');

    const [participants, updates, events, related, pm, runbooks] = await Promise.all([
      client.query(
        `SELECT p.*, u.display_name, u.email
         FROM major_incident_participants p
         JOIN users u ON u.id = p.user_id
         WHERE p.major_incident_id = $1 ORDER BY p.role::text, p.assigned_at`,
        [id],
      ),
      client.query(
        `SELECT u.*, usr.display_name AS author_name
         FROM major_incident_stakeholder_updates u
         JOIN users usr ON usr.id = u.author_id
         WHERE u.major_incident_id = $1 ORDER BY u.created_at DESC`,
        [id],
      ),
      client.query(
        `SELECT e.*, usr.display_name AS actor_name
         FROM major_incident_events e
         LEFT JOIN users usr ON usr.id = e.actor_user_id
         WHERE e.major_incident_id = $1 ORDER BY e.created_at DESC
         LIMIT 200`,
        [id],
      ),
      client.query(
        `SELECT r.*, i.number AS incident_number, i.title AS incident_title
         FROM major_incident_related_incidents r
         JOIN incidents i ON i.id = r.incident_id
         WHERE r.major_incident_id = $1`,
        [id],
      ),
      client.query(`SELECT * FROM postmortems WHERE major_incident_id = $1`, [id]),
      client.query(
        `SELECT srl.*, ka.title AS article_title, ka.number AS article_number, ka.status AS article_status
         FROM service_runbook_links srl
         JOIN knowledge_articles ka ON ka.id = srl.kb_article_id
         WHERE srl.tenant_id = $1
           AND srl.service_id = ANY($2::uuid[])`,
        [tenantId, (mi.rows[0] as { affected_service_ids: string[] }).affected_service_ids || []],
      ),
    ]);

    let wfStatus = null;
    try {
      wfStatus = await queryMajorIncidentWorkflowStatus(id);
    } catch {
      wfStatus = null;
    }

    res.json({
      major_incident: mi.rows[0],
      participants: participants.rows,
      stakeholder_updates: updates.rows,
      events: events.rows,
      related_incidents: related.rows,
      postmortem: pm.rows[0] ?? null,
      suggested_runbooks: runbooks.rows,
      workflow_status: wfStatus,
    });
    return;
  } catch (err) {
    next(err);
    return;
  }
});

// ─── PATCH /api/major-incidents/:id ───
router.patch(
  '/:id',
  requireMajorIncidentManage,
  validateBody(updateMajorIncidentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const id = routeId(req);
      const tenantId = req.user!.tenant_id;
      const body = req.body as Record<string, unknown>;
      const fields: string[] = [];
      const vals: unknown[] = [];
      let i = 1;
      if (body.title !== undefined) {
        fields.push(`title = $${i++}`);
        vals.push(body.title);
      }
      if (body.description !== undefined) {
        fields.push(`description = $${i++}`);
        vals.push(body.description);
      }
      if (body.war_room_channel !== undefined) {
        fields.push(`war_room_channel = $${i++}`);
        vals.push(body.war_room_channel);
      }
      if (fields.length === 0) {
        const cur = await client.query(`SELECT * FROM major_incidents WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
        if (cur.rows.length === 0) throw NotFound('Major incident not found');
        return res.json({ major_incident: cur.rows[0] });
      }
      vals.push(id, tenantId);
      const r = await client.query(
        `UPDATE major_incidents SET ${fields.join(', ')}, updated_at = now()
         WHERE id = $${i++} AND tenant_id = $${i}
         RETURNING *`,
        vals,
      );
      if (r.rows.length === 0) throw NotFound('Major incident not found');
      await insertMiEvent(client, tenantId, id, 'updated', { fields: Object.keys(body) }, req.user!.id);
      res.json({ major_incident: r.rows[0] });
      return;
    } catch (err) {
      next(err);
      return;
    }
  },
);

// ─── POST /api/major-incidents/:id/stakeholder-updates ───
router.post(
  '/:id/stakeholder-updates',
  requireMajorIncidentManage,
  validateBody(majorIncidentStakeholderUpdateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const id = routeId(req);
      const tenantId = req.user!.tenant_id;
      const st = await client.query(`SELECT status::text AS status FROM major_incidents WHERE id = $1 AND tenant_id = $2`, [
        id,
        tenantId,
      ]);
      if (st.rows.length === 0) throw NotFound('Major incident not found');
      if ((st.rows[0] as { status: string }).status === 'pending_acceptance') {
        return res.status(400).json({ error: 'Accept this major incident before posting stakeholder updates' });
      }
      const b = req.body as {
        audience: string;
        subject: string;
        body: string;
      };
      const ins = await client.query(
        `INSERT INTO major_incident_stakeholder_updates
           (tenant_id, major_incident_id, author_id, audience, subject, body)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [tenantId, id, req.user!.id, b.audience, b.subject || '', b.body],
      );
      await insertMiEvent(client, tenantId, id, 'stakeholder_update', { update_id: ins.rows[0].id }, req.user!.id);
      await signalMajorIncidentStakeholderUpdate(id);
      queueMajorIncidentNotification(tenantId, id, 'major_incident.stakeholder_update', req.user!.id);
      res.status(201).json({ update: ins.rows[0] });
      return;
    } catch (err) {
      next(err);
      return;
    }
  },
);

// ─── POST /api/major-incidents/:id/roles ───
router.post(
  '/:id/roles',
  requireMajorIncidentManage,
  validateBody(majorIncidentRoleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const id = routeId(req);
      const tenantId = req.user!.tenant_id;
      const st = await client.query(`SELECT status::text AS status FROM major_incidents WHERE id = $1 AND tenant_id = $2`, [
        id,
        tenantId,
      ]);
      if (st.rows.length === 0) throw NotFound('Major incident not found');
      if ((st.rows[0] as { status: string }).status === 'pending_acceptance') {
        return res.status(400).json({ error: 'Accept this major incident before assigning roles' });
      }
      const { role, user_id } = req.body as { role: string; user_id: string };

      if (role !== 'resolver') {
        await client.query(
          `DELETE FROM major_incident_participants
           WHERE major_incident_id = $1 AND role = $2::major_incident_participant_role_enum`,
          [id, role],
        );
      }

      const ins = await client.query(
        `INSERT INTO major_incident_participants (tenant_id, major_incident_id, role, user_id, assigned_by)
         VALUES ($1, $2, $3::major_incident_participant_role_enum, $4, $5)
         RETURNING *`,
        [tenantId, id, role, user_id, req.user!.id],
      );
      await insertMiEvent(client, tenantId, id, 'role_assigned', { role, user_id }, req.user!.id);
      res.status(201).json({ participant: ins.rows[0] });
      return;
    } catch (err) {
      next(err);
      return;
    }
  },
);

// ─── POST /api/major-incidents/:id/resolve ───
router.post(
  '/:id/resolve',
  requireMajorIncidentManage,
  validateBody(majorIncidentResolveSchema),
  async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = routeId(req);
    const tenantId = req.user!.tenant_id;
    const { solution } = req.body as { solution: string };
    const cur = await client.query(
      `SELECT id, status::text AS status FROM major_incidents WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (cur.rows.length === 0) throw NotFound('Major incident not found');
    const st = (cur.rows[0] as { status: string }).status;
    if (['resolved', 'cancelled', 'pending_acceptance'].includes(st)) {
      return res.status(400).json({ error: 'Invalid state for resolve' });
    }
    const upd = await client.query(
      `UPDATE major_incidents
       SET status = 'monitoring'::major_incident_status_enum,
           monitoring_until_at = now() + interval '5 minutes',
           resolution_summary = $3,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2
         AND status::text NOT IN ('resolved', 'cancelled', 'pending_acceptance')
       RETURNING *`,
      [id, tenantId, solution],
    );
    if (upd.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid state for resolve' });
    }
    await insertMiEvent(client, tenantId, id, 'resolve_requested', { solution }, req.user!.id);
    await signalMajorIncidentDeclareResolved(id);
    queueMajorIncidentNotification(tenantId, id, 'major_incident.resolve_requested', req.user!.id);
    res.json({ ok: true, major_incident: upd.rows[0] });
    return;
  } catch (err) {
    next(err);
    return;
  }
  },
);
router.post(
  '/:id/related-incidents',
  requireMajorIncidentManage,
  validateBody(majorIncidentRelatedSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const id = routeId(req);
      const tenantId = req.user!.tenant_id;
      const st = await client.query(`SELECT status::text AS status FROM major_incidents WHERE id = $1 AND tenant_id = $2`, [
        id,
        tenantId,
      ]);
      if (st.rows.length === 0) throw NotFound('Major incident not found');
      if ((st.rows[0] as { status: string }).status === 'pending_acceptance') {
        return res.status(400).json({ error: 'Accept this major incident before linking related incidents' });
      }
      const { incident_id, link_reason } = req.body as { incident_id: string; link_reason?: string };
      const ins = await client.query(
        `INSERT INTO major_incident_related_incidents (tenant_id, major_incident_id, incident_id, link_reason)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (major_incident_id, incident_id) DO UPDATE SET link_reason = EXCLUDED.link_reason
         RETURNING *`,
        [tenantId, id, incident_id, link_reason ?? null],
      );
      await insertMiEvent(client, tenantId, id, 'related_incident_linked', { incident_id }, req.user!.id);
      res.status(201).json({ link: ins.rows[0] });
      return;
    } catch (err) {
      next(err);
      return;
    }
  },
);

// ─── GET /api/major-incidents/:id/suggested-related ───
router.get('/:id/suggested-related', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = routeId(req);
    const tenantId = req.user!.tenant_id;
    const mi = await client.query(
      `SELECT affected_service_ids, declared_major_at FROM major_incidents WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (mi.rows.length === 0) throw NotFound('Major incident not found');
    const row = mi.rows[0] as { affected_service_ids: string[]; declared_major_at: Date };
    const svcIds = (row.affected_service_ids || []).filter(Boolean);
    const r = await client.query(
      `SELECT i.id, i.number, i.title, i.status, i.service_id, i.created_at
       FROM incidents i
       WHERE i.tenant_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM major_incident_related_incidents x
           WHERE x.major_incident_id = $2 AND x.incident_id = i.id
         )
         AND i.status NOT IN ('closed', 'cancelled')
         AND (
           coalesce(cardinality($3::uuid[]), 0) = 0
           OR i.service_id = ANY($3::uuid[])
         )
         AND i.created_at >= $4::timestamptz - interval '48 hours'
         AND i.created_at <= $4::timestamptz + interval '48 hours'
       ORDER BY i.created_at DESC
       LIMIT 25`,
      [tenantId, id, svcIds, row.declared_major_at],
    );
    res.json({ incidents: r.rows });
    return;
  } catch (err) {
    next(err);
    return;
  }
});

// ─── GET /api/major-incidents/:id/postmortem ───
router.get('/:id/postmortem', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = routeId(req);
    const tenantId = req.user!.tenant_id;
    const r = await client.query(
      `SELECT p.* FROM postmortems p
       JOIN major_incidents mi ON mi.id = p.major_incident_id
       WHERE p.major_incident_id = $1 AND mi.tenant_id = $2`,
      [id, tenantId],
    );
    if (r.rows.length === 0) {
      res.json({ postmortem: null });
      return;
    }
    res.json({ postmortem: r.rows[0] });
    return;
  } catch (err) {
    next(err);
    return;
  }
});

// ─── POST /api/major-incidents/:id/postmortem ───
router.post(
  '/:id/postmortem',
  requireMajorIncidentManage,
  validateBody(postmortemUpsertSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const id = routeId(req);
      const tenantId = req.user!.tenant_id;
      const mi = await client.query(`SELECT id FROM major_incidents WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
      if (mi.rows.length === 0) throw NotFound('Major incident not found');
      const existing = await client.query(`SELECT id FROM postmortems WHERE major_incident_id = $1`, [id]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Postmortem already exists' });
      }
      const b = req.body as Record<string, unknown>;
      const statusVal = (typeof b.status === 'string' ? b.status : 'draft') as string;
      const ins = await client.query(
        `INSERT INTO postmortems (tenant_id, major_incident_id, status, timeline, root_causes, contributing_factors, action_items, authored_by)
         VALUES ($1, $2, $3::postmortem_status_enum, $4::jsonb, $5, $6, $7::jsonb, $8)
         RETURNING *`,
        [
          tenantId,
          id,
          statusVal,
          JSON.stringify(b.timeline ?? []),
          b.root_causes ?? [],
          b.contributing_factors ?? [],
          JSON.stringify(b.action_items ?? []),
          req.user!.id,
        ],
      );
      res.status(201).json({ postmortem: ins.rows[0] });
      return;
    } catch (err) {
      next(err);
      return;
    }
  },
);

// ─── PATCH /api/major-incidents/:id/postmortem ───
router.patch(
  '/:id/postmortem',
  requireMajorIncidentManage,
  validateBody(postmortemUpsertSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const id = routeId(req);
      const tenantId = req.user!.tenant_id;
      const b = req.body as Record<string, unknown>;
      const sets: string[] = [];
      const vals: unknown[] = [];
      let i = 1;
      if (b.timeline !== undefined) {
        sets.push(`timeline = $${i++}::jsonb`);
        vals.push(JSON.stringify(b.timeline));
      }
      if (b.root_causes !== undefined) {
        sets.push(`root_causes = $${i++}`);
        vals.push(b.root_causes);
      }
      if (b.contributing_factors !== undefined) {
        sets.push(`contributing_factors = $${i++}`);
        vals.push(b.contributing_factors);
      }
      if (b.action_items !== undefined) {
        sets.push(`action_items = $${i++}::jsonb`);
        vals.push(JSON.stringify(b.action_items));
      }
      if (b.status !== undefined) {
        sets.push(`status = $${i++}::postmortem_status_enum`);
        vals.push(b.status);
      }
      if (sets.length === 0) {
        const cur = await client.query(
          `SELECT p.* FROM postmortems p JOIN major_incidents mi ON mi.id = p.major_incident_id
           WHERE p.major_incident_id = $1 AND mi.tenant_id = $2`,
          [id, tenantId],
        );
        if (cur.rows.length === 0) throw NotFound('Postmortem not found');
        return res.json({ postmortem: cur.rows[0] });
      }
      vals.push(id, tenantId);
      const r = await client.query(
        `UPDATE postmortems p SET ${sets.join(', ')}, updated_at = now()
         FROM major_incidents mi
         WHERE p.major_incident_id = mi.id AND p.major_incident_id = $${i++} AND mi.tenant_id = $${i}
         RETURNING p.*`,
        vals,
      );
      if (r.rows.length === 0) throw NotFound('Postmortem not found');
      res.json({ postmortem: r.rows[0] });
      return;
    } catch (err) {
      next(err);
      return;
    }
  },
);

// ─── POST /api/major-incidents/:id/postmortem/publish ───
router.post(
  '/:id/postmortem/publish',
  requireMajorIncidentManage,
  validateBody(publishPostmortemSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const id = routeId(req);
      const tenantId = req.user!.tenant_id;
      const b = req.body as { root_causes: string[]; contributing_factors: string[] };
      const r = await client.query(
        `UPDATE postmortems p
         SET status = 'published'::postmortem_status_enum,
             root_causes = $3,
             contributing_factors = $4,
             published_at = now(),
             updated_at = now()
         FROM major_incidents mi
         WHERE p.major_incident_id = mi.id AND p.major_incident_id = $1 AND mi.tenant_id = $2
         RETURNING p.*`,
        [id, tenantId, b.root_causes, b.contributing_factors],
      );
      if (r.rows.length === 0) throw NotFound('Postmortem not found');
      const postmortemId = (r.rows[0] as { id: string }).id;
      await insertMiEvent(client, tenantId, id, 'postmortem_published', { postmortemId }, req.user!.id);
      await signalPostmortemPublished(postmortemId);
      res.json({ postmortem: r.rows[0] });
      return;
    } catch (err) {
      next(err);
      return;
    }
  },
);

export default router;
