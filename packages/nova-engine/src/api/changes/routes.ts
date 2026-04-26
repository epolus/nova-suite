/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import {
  authenticate,
  getRequestClient,
  releaseTenantClient,
  setTenantRLS,
} from '../../middleware/auth';
import { validateBody, validateQuery } from '../../middleware/validate';
import {
  changeApprovalDecisionSchema,
  changeTransitionSchema,
  createBlackoutSchema,
  createCabMeetingSchema,
  createChangeSchema,
  createChangeTypeSchema,
  paginationSchema,
  updateBlackoutSchema,
  updateChangeSchema,
  updateChangeTypeSchema,
} from '../../domain/schemas';
import { AppError, NotFound } from '../../middleware/errorHandler';
import { hasChangeRole, isAdminRole } from '../roles';
import { startNotificationDispatch } from '../../temporal/workflows';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

const CHANGE_PROCESS_NAME = 'Change Management';
const CHANGE_TRANSITION_ACTIONS = [
  'submit_assessment',
  'request_approval',
  'approve',
  'reject',
  'start_planning',
  'schedule',
  'start_implementation',
  'mark_implemented',
  'start_review',
  'close',
  'cancel',
] as const;
type ChangeTransitionAction = (typeof CHANGE_TRANSITION_ACTIONS)[number];

async function isChangeEnabledGroup(client: any, groupId: string): Promise<boolean> {
  const row = await client.query(
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
             AND r.name = 'change_manager'
             AND r.is_active = true
         )
       )`,
    [groupId, CHANGE_PROCESS_NAME],
  );
  return row.rows.length > 0;
}

async function canWorkOnChange(client: any, req: Request, change: any): Promise<boolean> {
  if (isAdminRole(req)) return true;
  if (change.assigned_to && change.assigned_to === req.user!.id) return true;
  if (change.requested_by === req.user!.id) return true;
  if (change.assignment_group_id) {
    const m = await client.query(
      `SELECT 1 FROM assignment_group_members
       WHERE tenant_id = current_tenant_id()
         AND group_id = $1
         AND user_id = $2
       LIMIT 1`,
      [change.assignment_group_id, req.user!.id],
    );
    if (m.rows.length > 0) return true;
  }
  return hasChangeRole(req);
}

function normalizeStatusAndStage(action: string): { stage: string; status: string } {
  switch (action) {
    case 'submit_assessment':
      return { stage: 'assessment', status: 'assessment' };
    case 'request_approval':
      return { stage: 'approval', status: 'pending_approval' };
    case 'approve':
      return { stage: 'planning', status: 'approved' };
    case 'reject':
      return { stage: 'approval', status: 'rejected' };
    case 'start_planning':
      return { stage: 'planning', status: 'planning' };
    case 'schedule':
      return { stage: 'planning', status: 'scheduled' };
    case 'start_implementation':
      return { stage: 'implementation', status: 'implementing' };
    case 'mark_implemented':
      return { stage: 'implementation', status: 'implemented' };
    case 'start_review':
      return { stage: 'review', status: 'reviewing' };
    case 'close':
      return { stage: 'review', status: 'closed' };
    case 'cancel':
      return { stage: 'request', status: 'cancelled' };
    default:
      return { stage: 'request', status: 'draft' };
  }
}

function computeAllowedChangeActions(
  change: any,
  pendingApprovals: number,
  hasCiContext: boolean,
): ChangeTransitionAction[] {
  const actions: ChangeTransitionAction[] = [];
  const status = String(change.status || '');
  const hasSchedule = Boolean(change.scheduled_start && change.scheduled_end);
  const hasServiceOrCiContext = hasCiContext || Boolean(change.service_id);

  if (status === 'draft') actions.push('submit_assessment');
  if (
    status === 'assessment'
    && !!change.implementation_plan
    && hasSchedule
    && hasServiceOrCiContext
  ) {
    actions.push('request_approval');
  }
  if (status === 'approved') actions.push('start_planning');
  if (status === 'planning') actions.push('schedule');
  if (status === 'scheduled') actions.push('start_implementation');
  if (status === 'implementing') actions.push('mark_implemented');
  if (status === 'implemented') actions.push('start_review');
  if (status === 'reviewing') actions.push('close');
  if (status === 'pending_approval') {
    actions.push('reject');
    if (pendingApprovals === 0 && hasSchedule) actions.push('approve');
  }
  if (!['closed', 'cancelled'].includes(status)) actions.push('cancel');

  return actions;
}

async function syncRelatedRecords(client: any, change: any): Promise<void> {
  if (change.status !== 'closed') return;
  if (change.related_incident_id) {
    await client.query(
      `UPDATE incidents
       SET status = CASE WHEN $2 = true THEN 'resolved'::incident_status_enum ELSE status END,
           resolution_notes = COALESCE(resolution_notes, '') || E'\nLinked change ' || $1 || ' closed.',
           updated_at = now()
       WHERE tenant_id = current_tenant_id()
         AND id = $3`,
      [change.number, change.success, change.related_incident_id],
    );
  }
  if (change.related_problem_id && change.success === true) {
    await client.query(
      `UPDATE problems
       SET status = 'resolved'::problem_status_enum,
           resolution_notes = COALESCE(resolution_notes, '') || E'\nResolved via change ' || $1,
           resolved_at = COALESCE(resolved_at, now()),
           updated_at = now()
       WHERE tenant_id = current_tenant_id()
         AND id = $2
         AND status <> 'closed'::problem_status_enum`,
      [change.number, change.related_problem_id],
    );
  }
}

async function refreshChangeConflicts(client: any, changeId: string): Promise<void> {
  const changeRes = await client.query(
    `SELECT c.id, c.scheduled_start, c.scheduled_end, c.risk_level
     FROM changes c
     WHERE c.tenant_id = current_tenant_id()
       AND c.id = $1`,
    [changeId],
  );
  if (changeRes.rows.length === 0) return;
  const c = changeRes.rows[0];
  await client.query(
    `DELETE FROM change_conflicts
     WHERE tenant_id = current_tenant_id()
       AND change_id = $1::uuid`,
    [changeId],
  );
  if (!c.scheduled_start || !c.scheduled_end) return;
  if (new Date(c.scheduled_start).getTime() > new Date(c.scheduled_end).getTime()) return;

  await client.query(
    `INSERT INTO change_conflicts (tenant_id, change_id, conflicting_change_id, conflict_type, severity, details)
     SELECT
       current_tenant_id(),
       $1::uuid,
       c2.id,
       'schedule_overlap',
       CASE
         WHEN $2::change_risk_enum IN ('high'::change_risk_enum, 'very_high'::change_risk_enum) THEN 'blocking'
         ELSE 'warning'
       END,
       'Overlapping schedule windows'
     FROM changes c2
     WHERE c2.tenant_id = current_tenant_id()
       AND c2.id <> $1::uuid
       AND c2.status IN ('approved', 'scheduled', 'implementing', 'implemented', 'reviewing')
       AND tstzrange(c2.scheduled_start, c2.scheduled_end, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')`,
    [changeId, c.risk_level, c.scheduled_start, c.scheduled_end],
  );

  await client.query(
    `INSERT INTO change_conflicts (tenant_id, change_id, conflict_type, severity, details)
     SELECT current_tenant_id(), $1::uuid, 'blackout_window', 'blocking', 'Scheduled window intersects blackout period: ' || b.name
     FROM change_blackouts b
     WHERE b.tenant_id = current_tenant_id()
       AND tstzrange(b.start_date, b.end_date, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
    [changeId, c.scheduled_start, c.scheduled_end],
  );

  await client.query(
    `INSERT INTO change_conflicts (tenant_id, change_id, conflicting_change_id, conflict_type, severity, details)
     SELECT DISTINCT
       current_tenant_id(),
       $1::uuid,
       c2.id,
       'ci_overlap',
       CASE
         WHEN $2::change_risk_enum = 'very_high'::change_risk_enum THEN 'blocking'
         ELSE 'warning'
       END,
       'Multiple changes impact the same CI in overlapping windows'
     FROM change_cis cc
     JOIN change_cis cc2 ON cc2.ci_id = cc.ci_id AND cc2.change_id <> cc.change_id
     JOIN changes c2 ON c2.id = cc2.change_id
     WHERE cc.tenant_id = current_tenant_id()
       AND cc.change_id = $1::uuid
       AND c2.tenant_id = current_tenant_id()
       AND c2.status IN ('approved', 'scheduled', 'implementing', 'implemented', 'reviewing')
       AND tstzrange(c2.scheduled_start, c2.scheduled_end, '[)') && tstzrange($3::timestamptz, $4::timestamptz, '[)')`,
    [changeId, c.risk_level, c.scheduled_start, c.scheduled_end],
  );
}

function validateScheduleRange(start: unknown, end: unknown): void {
  if (!start || !end) return;
  const startMs = new Date(String(start)).getTime();
  const endMs = new Date(String(end)).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
  if (startMs > endMs) {
    throw new AppError(400, 'scheduled_end must be greater than or equal to scheduled_start');
  }
}

router.get('/assignment-groups', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT ag.id, ag.name
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
               AND r.name = 'change_manager'
               AND r.is_active = true
           )
         )
       ORDER BY ag.name`,
      [CHANGE_PROCESS_NAME],
    );
    res.json({ assignment_groups: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/types', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT *
       FROM change_types
       WHERE tenant_id = current_tenant_id()
       ORDER BY name`,
    );
    res.json({ change_types: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/types', validateBody(createChangeTypeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const b = req.body || {};
    const created = await client.query(
      `INSERT INTO change_types
       (tenant_id, name, description, requires_cab_approval, requires_manager_approval, auto_approve,
        default_risk_level, max_implementation_hours, approval_config, is_active)
       VALUES (current_tenant_id(), $1, $2, COALESCE($3, true), COALESCE($4, true), COALESCE($5, false),
               COALESCE($6::change_risk_enum, 'medium'::change_risk_enum), $7, COALESCE($8, '{"required_approvals":1}'::jsonb), COALESCE($9, true))
       RETURNING *`,
      [
        b.name,
        b.description || null,
        b.requires_cab_approval,
        b.requires_manager_approval,
        b.auto_approve,
        b.default_risk_level || null,
        b.max_implementation_hours || null,
        b.approval_config || null,
        b.is_active,
      ],
    );
    res.status(201).json(created.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/types/:id', validateBody(updateChangeTypeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(req.body || {})) {
      if (k === 'default_risk_level') {
        sets.push(`${k} = $${i++}::change_risk_enum`);
      } else {
        sets.push(`${k} = $${i++}`);
      }
      vals.push(v);
    }
    if (sets.length === 0) return void res.json({ success: true });
    vals.push(req.params.id);
    const updated = await client.query(
      `UPDATE change_types
       SET ${sets.join(', ')}
       WHERE tenant_id = current_tenant_id()
         AND id = $${i}
       RETURNING *`,
      vals,
    );
    if (updated.rows.length === 0) throw NotFound('Change type not found');
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/standard-templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT sc.*, ct.name AS change_type_name
       FROM standard_changes sc
       JOIN change_types ct ON ct.id = sc.change_type_id
       WHERE sc.tenant_id = current_tenant_id()
       ORDER BY sc.name`,
    );
    res.json({ templates: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/standard-templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const b = req.body || {};
    if (!b.change_type_id || !b.name) throw new AppError(400, 'change_type_id and name are required');
    const created = await client.query(
      `INSERT INTO standard_changes
       (tenant_id, change_type_id, name, description, category, implementation_plan_template, backout_plan_template, test_plan_template,
        pre_assessed_risk, automated, automation_script, usage_count, success_rate, is_active)
       VALUES (current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, COALESCE($8::change_risk_enum, 'low'::change_risk_enum), COALESCE($9, false), $10, COALESCE($11, 0), $12, COALESCE($13, true))
       RETURNING *`,
      [
        b.change_type_id,
        b.name,
        b.description || null,
        b.category || null,
        b.implementation_plan_template || null,
        b.backout_plan_template || null,
        b.test_plan_template || null,
        b.pre_assessed_risk || null,
        b.automated,
        b.automation_script || null,
        b.usage_count,
        b.success_rate ?? null,
        b.is_active,
      ],
    );
    res.status(201).json(created.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/standard-templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(req.body || {})) {
      if (k === 'pre_assessed_risk') {
        sets.push(`${k} = $${i++}::change_risk_enum`);
      } else {
        sets.push(`${k} = $${i++}`);
      }
      vals.push(v);
    }
    if (sets.length === 0) return void res.json({ success: true });
    vals.push(req.params.id);
    const updated = await client.query(
      `UPDATE standard_changes
       SET ${sets.join(', ')}
       WHERE tenant_id = current_tenant_id()
         AND id = $${i}
       RETURNING *`,
      vals,
    );
    if (updated.rows.length === 0) throw NotFound('Template not found');
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/cab-meetings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT m.*, u.display_name AS created_by_name
       FROM cab_meetings m
       LEFT JOIN users u ON u.id = m.created_by
       WHERE m.tenant_id = current_tenant_id()
       ORDER BY m.scheduled_at DESC`,
    );
    res.json({ meetings: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/cab-meetings', validateBody(createCabMeetingSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const b = req.body || {};
    const created = await client.query(
      `INSERT INTO cab_meetings
       (tenant_id, title, scheduled_at, duration_min, minutes, created_by)
       VALUES (current_tenant_id(), $1, $2, $3, $4, $5)
       RETURNING *`,
      [b.title, b.scheduled_at, b.duration_min || 60, b.minutes || null, req.user!.id],
    );
    res.status(201).json(created.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/cab-meetings/:id/changes/:changeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    await client.query(
      `INSERT INTO cab_meeting_changes (tenant_id, cab_meeting_id, change_id)
       VALUES (current_tenant_id(), $1, $2)
       ON CONFLICT (tenant_id, cab_meeting_id, change_id) DO NOTHING`,
      [req.params.id, req.params.changeId],
    );
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.patch('/cab-meetings/:id/changes/:changeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const decision = req.body?.decision;
    const notes = req.body?.notes || null;
    if (!['approved', 'rejected', 'deferred'].includes(decision)) {
      throw new AppError(400, 'decision must be approved, rejected or deferred');
    }
    await client.query(
      `UPDATE cab_meeting_changes
       SET decision = $1, notes = $2
       WHERE tenant_id = current_tenant_id()
         AND cab_meeting_id = $3
         AND change_id = $4`,
      [decision, notes, req.params.id, req.params.changeId],
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/blackouts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT *
       FROM change_blackouts
       WHERE tenant_id = current_tenant_id()
       ORDER BY start_date DESC`,
    );
    res.json({ blackouts: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/blackouts', validateBody(createBlackoutSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const b = req.body || {};
    const created = await client.query(
      `INSERT INTO change_blackouts (tenant_id, name, start_date, end_date, reason)
       VALUES (current_tenant_id(), $1, $2, $3, $4)
       RETURNING *`,
      [b.name, b.start_date, b.end_date, b.reason || null],
    );
    res.status(201).json(created.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/blackouts/:id', validateBody(updateBlackoutSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(req.body || {})) {
      sets.push(`${k} = $${i++}`);
      vals.push(v);
    }
    if (sets.length === 0) return void res.json({ success: true });
    vals.push(req.params.id);
    const updated = await client.query(
      `UPDATE change_blackouts
       SET ${sets.join(', ')}
       WHERE tenant_id = current_tenant_id()
         AND id = $${i}
       RETURNING *`,
      vals,
    );
    if (updated.rows.length === 0) throw NotFound('Blackout not found');
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/calendar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const params: unknown[] = [];
    let idx = 1;
    let where = `c.tenant_id = current_tenant_id()`;
    if (from) {
      where += ` AND c.scheduled_end >= $${idx++}::timestamptz`;
      params.push(from);
    }
    if (to) {
      where += ` AND c.scheduled_start <= $${idx++}::timestamptz`;
      params.push(to);
    }
    const rows = await client.query(
      `SELECT c.id, c.number, c.title, c.status, c.risk_level, c.category, c.scheduled_start, c.scheduled_end,
              ct.name AS change_type_name, ag.name AS assignment_group_name,
              COALESCE(conflicts.conflict_count, 0)::int AS conflict_count
       FROM changes c
       JOIN change_types ct ON ct.id = c.change_type_id
       LEFT JOIN assignment_groups ag ON ag.id = c.assignment_group_id
       LEFT JOIN (
         SELECT change_id, count(*) AS conflict_count
         FROM change_conflicts
         WHERE tenant_id = current_tenant_id()
         GROUP BY change_id
       ) conflicts ON conflicts.change_id = c.id
       WHERE ${where}
       ORDER BY c.scheduled_start NULLS LAST, c.updated_at DESC`,
      params,
    );
    const blackouts = await client.query(
      `SELECT *
       FROM change_blackouts
       WHERE tenant_id = current_tenant_id()
       ORDER BY start_date`,
    );
    res.json({ changes: rows.rows, blackouts: blackouts.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/conflicts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT cc.*, c2.number AS conflicting_change_number, c2.title AS conflicting_change_title
       FROM change_conflicts cc
       LEFT JOIN changes c2 ON c2.id = cc.conflicting_change_id
       WHERE cc.tenant_id = current_tenant_id()
         AND cc.change_id = $1
       ORDER BY cc.severity DESC, cc.created_at DESC`,
      [req.params.id],
    );
    res.json({ conflicts: rows.rows });
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
      const conditions: string[] = ['c.tenant_id = current_tenant_id()'];
      const params: unknown[] = [];
      let idx = 1;

      if (!hasChangeRole(req)) {
        conditions.push(`(c.requested_by = $${idx} OR c.assigned_to = $${idx})`);
        params.push(req.user!.id);
        idx++;
      }
      if (req.query.status) { conditions.push(`c.status = $${idx++}::change_status_enum`); params.push(req.query.status); }
      if (req.query.stage) { conditions.push(`c.stage = $${idx++}::change_stage_enum`); params.push(req.query.stage); }
      if (req.query.risk_level) { conditions.push(`c.risk_level = $${idx++}::change_risk_enum`); params.push(req.query.risk_level); }
      if (req.query.change_type_id) { conditions.push(`c.change_type_id = $${idx++}`); params.push(req.query.change_type_id); }
      if (req.query.assignment_group_id) { conditions.push(`c.assignment_group_id = $${idx++}`); params.push(req.query.assignment_group_id); }
      if (req.query.search) {
        conditions.push(`(c.number ILIKE $${idx} OR c.title ILIKE $${idx} OR c.description ILIKE $${idx})`);
        params.push(`%${req.query.search}%`);
        idx++;
      }

      const where = `WHERE ${conditions.join(' AND ')}`;
      const allowedSortCols: Record<string, string> = {
        number: 'c.number',
        title: 'c.title',
        status: 'c.status',
        stage: 'c.stage',
        risk_level: 'c.risk_level',
        priority: 'c.priority',
        scheduled_start: 'c.scheduled_start',
        updated_at: 'c.updated_at',
        created_at: 'c.created_at',
      };
      const sortCol = allowedSortCols[String(req.query.sort_by || '')];
      const sortDir = req.query.sort_dir === 'desc' ? 'DESC' : 'ASC';
      const orderClause = sortCol ? `ORDER BY ${sortCol} ${sortDir}` : 'ORDER BY c.updated_at DESC';

      const count = await client.query(
        `SELECT count(*)
         FROM changes c
         ${where}`,
        params,
      );
      const total = Number(count.rows[0]?.count || 0);
      params.push(limit, offset);
      const list = await client.query(
        `SELECT c.*,
                ct.name AS change_type_name,
                ag.name AS assignment_group_name,
                u.display_name AS assigned_to_name,
                r.display_name AS requested_by_name,
                COALESCE(conflicts.conflict_count, 0)::int AS conflict_count,
                COALESCE(approvals.pending_approvals, 0)::int AS pending_approvals
         FROM changes c
         JOIN change_types ct ON ct.id = c.change_type_id
         LEFT JOIN assignment_groups ag ON ag.id = c.assignment_group_id
         LEFT JOIN users u ON u.id = c.assigned_to
         LEFT JOIN users r ON r.id = c.requested_by
         LEFT JOIN (
           SELECT change_id, count(*) AS conflict_count
           FROM change_conflicts
           WHERE tenant_id = current_tenant_id()
           GROUP BY change_id
         ) conflicts ON conflicts.change_id = c.id
         LEFT JOIN (
           SELECT change_id, count(*) FILTER (WHERE status = 'pending') AS pending_approvals
           FROM change_approvals
           WHERE tenant_id = current_tenant_id()
           GROUP BY change_id
         ) approvals ON approvals.change_id = c.id
         ${where}
         ${orderClause}
         LIMIT $${idx} OFFSET $${idx + 1}`,
        params,
      );
      res.json({
        changes: list.rows,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/changes/stats ───
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const r = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('closed','cancelled','rejected'))::int AS open_total,
         COUNT(*) FILTER (WHERE status = 'pending_approval')::int AS pending_approval
       FROM changes`,
    );
    const row = r.rows[0];
    res.json({ open_total: row.open_total, pending_approval: row.pending_approval });
  } catch (err) {
    next(err);
  }
});

router.get('/nav', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const currentId = String(req.query.current || '');
    if (!currentId) return void res.json({ prev_id: null, next_id: null });

    const conditions: string[] = ['c.tenant_id = current_tenant_id()'];
    const params: unknown[] = [];
    let idx = 1;
    if (!hasChangeRole(req)) {
      conditions.push(`(c.requested_by = $${idx} OR c.assigned_to = $${idx})`);
      params.push(req.user!.id);
      idx++;
    }
    if (req.query.status) { conditions.push(`c.status = $${idx++}::change_status_enum`); params.push(req.query.status); }
    if (req.query.stage) { conditions.push(`c.stage = $${idx++}::change_stage_enum`); params.push(req.query.stage); }
    if (req.query.risk_level) { conditions.push(`c.risk_level = $${idx++}::change_risk_enum`); params.push(req.query.risk_level); }
    if (req.query.change_type_id) { conditions.push(`c.change_type_id = $${idx++}`); params.push(req.query.change_type_id); }
    if (req.query.search) {
      conditions.push(`(c.number ILIKE $${idx} OR c.title ILIKE $${idx} OR c.description ILIKE $${idx})`);
      params.push(`%${req.query.search}%`);
      idx++;
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const rows = await client.query(
      `SELECT c.id
       FROM changes c
       ${where}
       ORDER BY c.updated_at DESC`,
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

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const row = await client.query(
      `SELECT c.*,
              ct.name AS change_type_name,
              svc.name AS service_name,
              ag.name AS assignment_group_name,
              u.display_name AS assigned_to_name,
              r.display_name AS requested_by_name
       FROM changes c
       JOIN change_types ct ON ct.id = c.change_type_id
       LEFT JOIN services svc ON svc.id = c.service_id
       LEFT JOIN assignment_groups ag ON ag.id = c.assignment_group_id
       LEFT JOIN users u ON u.id = c.assigned_to
       LEFT JOIN users r ON r.id = c.requested_by
       WHERE c.tenant_id = current_tenant_id()
         AND c.id = $1`,
      [req.params.id],
    );
    if (row.rows.length === 0) throw NotFound('Change not found');
    const change = row.rows[0];
    const canWork = await canWorkOnChange(client, req, change);
    if (!canWork) throw new AppError(403, 'Insufficient permissions');
    const [cis, approvals, conflicts] = await Promise.all([
      client.query(
        `SELECT cc.ci_id, ci.display_name, ci.name
         FROM change_cis cc
         JOIN configuration_items ci ON ci.id = cc.ci_id
         WHERE cc.tenant_id = current_tenant_id()
           AND cc.change_id = $1`,
        [req.params.id],
      ),
      client.query(
        `SELECT ca.*,
                u.display_name AS approver_name,
                g.name AS approver_group_name
         FROM change_approvals ca
         LEFT JOIN users u ON u.id = ca.approver_user_id
         LEFT JOIN assignment_groups g ON g.id = ca.approver_group_id
         WHERE ca.tenant_id = current_tenant_id()
           AND ca.change_id = $1
         ORDER BY ca.created_at`,
        [req.params.id],
      ),
      client.query(
        `SELECT *
         FROM change_conflicts
         WHERE tenant_id = current_tenant_id()
           AND change_id = $1
         ORDER BY severity DESC, created_at DESC`,
        [req.params.id],
      ),
    ]);
    const pendingApprovals = approvals.rows.filter((a: { status: string }) => a.status === 'pending').length;
    const allowedActions = computeAllowedChangeActions(change, pendingApprovals, cis.rows.length > 0);
    res.json({
      ...change,
      affected_cis: cis.rows,
      approvals: approvals.rows,
      conflicts: conflicts.rows,
      allowed_actions: allowedActions,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', validateBody(createChangeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const b = req.body || {};
    validateScheduleRange(b.scheduled_start, b.scheduled_end);
    if (!b.assignment_group_id) {
      throw new AppError(400, 'assignment_group_id is required');
    }
    const createGroupOk = await isChangeEnabledGroup(client, b.assignment_group_id);
    if (!createGroupOk) throw new AppError(400, 'Assignment group is not enabled for Change Management');
    const typeRes = await client.query(
      `SELECT * FROM change_types
       WHERE tenant_id = current_tenant_id()
         AND id = $1
         AND is_active = true`,
      [b.change_type_id],
    );
    if (typeRes.rows.length === 0) throw new AppError(400, 'Invalid change type');
    const changeType = typeRes.rows[0];

    const seq = await client.query(`SELECT nextval('change_number_seq') AS n`);
    const number = `CHG${String(seq.rows[0].n).padStart(7, '0')}`;

    const stage = b.stage || 'request';
    let status = b.status || 'draft';
    if (changeType.auto_approve && changeType.name === 'standard') {
      status = 'approved';
    }

    const description = String(b.description || '').trim() || String(b.title || '').trim() || 'Draft change';
    const reasonForChange = String(b.reason_for_change || '').trim() || 'Pending assessment';
    const implementationPlan = String(b.implementation_plan || '').trim() || 'Implementation plan to be defined during planning.';
    const backoutPlan = String(b.backout_plan || '').trim() || 'Backout plan to be defined during planning.';

    const created = await client.query(
      `INSERT INTO changes (
        tenant_id, number, change_type_id, standard_change_id, category, title, description, reason_for_change,
        stage, status, risk_level, impact, impact_description, implementation_plan, backout_plan, test_plan,
        requested_by, assigned_to, assignment_group_id, service_id, scheduled_start, scheduled_end, actual_start, actual_end,
        downtime_required, maintenance_window, implementation_notes, success, actual_downtime_minutes,
        related_problem_id, related_incident_id, priority, business_justification, estimated_cost, review_notes
      ) VALUES (
        current_tenant_id(), $1, $2, $3, $4, $5, $6, $7,
        $8::change_stage_enum, $9::change_status_enum, $10::change_risk_enum, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23,
        COALESCE($24, false), $25, $26, $27, $28,
        $29, $30, $31::change_priority_enum, $32, $33, $34
      ) RETURNING *`,
      [
        number,
        b.change_type_id,
        b.standard_change_id || null,
        b.category || null,
        b.title,
        description,
        reasonForChange,
        stage,
        status,
        b.risk_level || changeType.default_risk_level,
        b.impact || 'medium',
        b.impact_description || null,
        implementationPlan,
        backoutPlan,
        b.test_plan || null,
        b.requested_by || req.user!.id,
        b.assigned_to || null,
        b.assignment_group_id || null,
        b.service_id || null,
        b.scheduled_start || null,
        b.scheduled_end || null,
        b.actual_start || null,
        b.actual_end || null,
        b.downtime_required,
        b.maintenance_window || null,
        b.implementation_notes || null,
        b.success ?? null,
        b.actual_downtime_minutes ?? null,
        b.related_problem_id || null,
        b.related_incident_id || null,
        b.priority || 'medium',
        b.business_justification || null,
        b.estimated_cost ?? null,
        b.review_notes || null,
      ],
    );
    const change = created.rows[0];
    const cis = Array.isArray(b.affected_cis) ? b.affected_cis : [];
    for (const ciId of cis) {
      await client.query(
        `INSERT INTO change_cis (tenant_id, change_id, ci_id)
         VALUES (current_tenant_id(), $1, $2)
         ON CONFLICT (tenant_id, change_id, ci_id) DO NOTHING`,
        [change.id, ciId],
      );
    }

    await refreshChangeConflicts(client, change.id);
    startNotificationDispatch({
      tenantId: req.user!.tenant_id,
      entityType: 'change',
      triggerKey: 'change.created',
      entityId: String(change.id),
      actorUserId: req.user!.id,
    }).catch(() => {});
    res.status(201).json(change);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validateBody(updateChangeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const currentRes = await client.query(
      `SELECT * FROM changes
       WHERE tenant_id = current_tenant_id()
         AND id = $1`,
      [req.params.id],
    );
    if (currentRes.rows.length === 0) throw NotFound('Change not found');
    const current = currentRes.rows[0];
    const canWork = await canWorkOnChange(client, req, current);
    if (!canWork) throw new AppError(403, 'Insufficient permissions');
    const updates = req.body || {};
    validateScheduleRange(
      updates.scheduled_start ?? current.scheduled_start,
      updates.scheduled_end ?? current.scheduled_end,
    );
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
      const ok = await isChangeEnabledGroup(client, updates.assignment_group_id);
      if (!ok) throw new AppError(400, 'Assignment group is not enabled for Change Management');
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(updates)) {
      if (k === 'affected_cis') continue;
      if (k === 'status') {
        sets.push(`status = $${i++}::change_status_enum`);
      } else if (k === 'stage') {
        sets.push(`stage = $${i++}::change_stage_enum`);
      } else if (k === 'risk_level') {
        sets.push(`risk_level = $${i++}::change_risk_enum`);
      } else if (k === 'priority') {
        sets.push(`priority = $${i++}::change_priority_enum`);
      } else {
        sets.push(`${k} = $${i++}`);
      }
      vals.push(v);
    }
    if (sets.length) {
      vals.push(req.params.id);
      await client.query(
        `UPDATE changes
         SET ${sets.join(', ')}
         WHERE tenant_id = current_tenant_id()
           AND id = $${i}`,
        vals,
      );
    }
    if (Array.isArray(updates.affected_cis)) {
      await client.query(
        `DELETE FROM change_cis
         WHERE tenant_id = current_tenant_id()
           AND change_id = $1`,
        [req.params.id],
      );
      for (const ciId of updates.affected_cis) {
        await client.query(
          `INSERT INTO change_cis (tenant_id, change_id, ci_id)
           VALUES (current_tenant_id(), $1, $2)
           ON CONFLICT (tenant_id, change_id, ci_id) DO NOTHING`,
          [req.params.id, ciId],
        );
      }
    }
    await refreshChangeConflicts(client, String(req.params.id));
    const updated = await client.query(
      `SELECT *
       FROM changes
       WHERE tenant_id = current_tenant_id()
         AND id = $1`,
      [req.params.id],
    );
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/transition', validateBody(changeTransitionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const changeRes = await client.query(
      `SELECT c.*, ct.auto_approve, ct.approval_config
       FROM changes c
       JOIN change_types ct ON ct.id = c.change_type_id
       WHERE c.tenant_id = current_tenant_id()
         AND c.id = $1`,
      [req.params.id],
    );
    if (changeRes.rows.length === 0) throw NotFound('Change not found');
    const change = changeRes.rows[0];
    const canWork = await canWorkOnChange(client, req, change);
    if (!canWork) throw new AppError(403, 'Insufficient permissions');

    const { action, notes, scheduled_start, scheduled_end } = req.body;
    const pendingApprovalsRes = await client.query(
      `SELECT count(*) AS c
       FROM change_approvals
       WHERE tenant_id = current_tenant_id()
         AND change_id = $1
         AND status = 'pending'`,
      [change.id],
    );
    const pendingApprovals = Number(pendingApprovalsRes.rows[0]?.c || 0);
    const changeCiRes = await client.query(
      `SELECT count(*) AS c
       FROM change_cis
       WHERE tenant_id = current_tenant_id()
         AND change_id = $1`,
      [change.id],
    );
    const hasCiContext = Number(changeCiRes.rows[0]?.c || 0) > 0;
    const allowedActions = computeAllowedChangeActions(change, pendingApprovals, hasCiContext);
    if (!allowedActions.includes(action as ChangeTransitionAction)) {
      throw new AppError(400, `Action "${action}" is not allowed for current change status`);
    }
    if (action === 'request_approval' && !change.implementation_plan) {
      throw new AppError(400, 'Implementation plan is required before requesting approval');
    }
    if (action === 'request_approval' && (!change.scheduled_start || !change.scheduled_end)) {
      throw new AppError(400, 'scheduled_start and scheduled_end are required before requesting approval');
    }
    if (action === 'request_approval' && !hasCiContext && !change.service_id) {
      throw new AppError(400, 'Service / CI context is required before requesting approval');
    }
    if (action === 'schedule' && (!scheduled_start || !scheduled_end)) {
      throw new AppError(400, 'scheduled_start and scheduled_end are required to schedule');
    }
    if (action === 'approve') {
      if (!change.scheduled_start || !change.scheduled_end) {
        throw new AppError(400, 'scheduled_start and scheduled_end are required before approval');
      }
      if (pendingApprovals > 0) {
        throw new AppError(400, 'All required approvals must be completed before approving the change');
      }
    }
    if (action === 'submit_assessment') {
      await client.query(
        `DELETE FROM change_approvals
         WHERE tenant_id = current_tenant_id()
           AND change_id = $1`,
        [change.id],
      );
    }
    if (action === 'request_approval') {
      const existingApprovals = await client.query(
        `SELECT count(*) AS c
         FROM change_approvals
         WHERE tenant_id = current_tenant_id()
           AND change_id = $1`,
        [change.id],
      );
      if (Number(existingApprovals.rows[0]?.c || 0) === 0) {
        const typeRes = await client.query(
          `SELECT requires_cab_approval, requires_manager_approval, approval_config
           FROM change_types
           WHERE tenant_id = current_tenant_id()
             AND id = $1`,
          [change.change_type_id],
        );
        const changeType = typeRes.rows[0];
        const requiredApprovals = Number(changeType?.approval_config?.required_approvals || 1);
        const approvalRows: Array<{ type: string; userId: string | null }> = [];
        if (changeType?.requires_manager_approval) {
          const requesterManager = await client.query(
            `SELECT manager_id
             FROM users
             WHERE tenant_id = current_tenant_id()
               AND id = $1`,
            [change.requested_by],
          );
          approvalRows.push({ type: 'manager', userId: requesterManager.rows[0]?.manager_id || null });
        }
        if (changeType?.requires_cab_approval) {
          approvalRows.push({ type: 'cab', userId: null });
        }
        while (approvalRows.length < requiredApprovals) {
          approvalRows.push({ type: 'technical', userId: null });
        }
        for (const a of approvalRows) {
          await client.query(
            `INSERT INTO change_approvals
             (tenant_id, change_id, approval_type, approver_user_id, approver_group_id)
             VALUES (current_tenant_id(), $1, $2, $3, $4)`,
            [change.id, a.type, a.userId, change.assignment_group_id || null],
          );
        }
      }
    }

    const state = normalizeStatusAndStage(action);
    await client.query(
      `UPDATE changes
       SET stage = $1::change_stage_enum,
           status = $2::change_status_enum,
           scheduled_start = COALESCE($3::timestamptz, scheduled_start),
           scheduled_end = COALESCE($4::timestamptz, scheduled_end),
           actual_start = CASE WHEN $2 = 'implementing'::change_status_enum THEN COALESCE(actual_start, now()) ELSE actual_start END,
           actual_end = CASE WHEN $2 = 'implemented'::change_status_enum OR $2 = 'closed'::change_status_enum THEN COALESCE(actual_end, now()) ELSE actual_end END,
           implementation_notes = CASE WHEN $5::text IS NULL OR $5::text = '' THEN implementation_notes ELSE COALESCE(implementation_notes, '') || E'\n' || $5::text END
       WHERE tenant_id = current_tenant_id()
         AND id = $6`,
      [state.stage, state.status, scheduled_start || null, scheduled_end || null, notes || null, req.params.id],
    );
    await refreshChangeConflicts(client, String(req.params.id));
    const updated = await client.query(
      `SELECT *
       FROM changes
       WHERE tenant_id = current_tenant_id()
         AND id = $1`,
      [req.params.id],
    );
    await syncRelatedRecords(client, updated.rows[0]);
    const transitionTriggerByAction: Record<string, string> = {
      request_approval: 'change.pending_approval',
      approve: 'change.approved',
      reject: 'change.rejected',
      schedule: 'change.scheduled',
    };
    const transitionTrigger = transitionTriggerByAction[String(action)];
    if (transitionTrigger) {
      startNotificationDispatch({
        tenantId: req.user!.tenant_id,
        entityType: 'change',
        triggerKey: transitionTrigger,
        entityId: String(req.params.id),
        actorUserId: req.user!.id,
      }).catch(() => {});
    }
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/approvals/:approvalId/decision', validateBody(changeApprovalDecisionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const approvalRes = await client.query(
      `SELECT *
       FROM change_approvals
       WHERE tenant_id = current_tenant_id()
         AND change_id = $1
         AND id = $2`,
      [req.params.id, req.params.approvalId],
    );
    if (approvalRes.rows.length === 0) throw NotFound('Approval not found');
    const approval = approvalRes.rows[0];

    const isAdmin = isAdminRole(req);
    const isDirectApprover = approval.approver_user_id && approval.approver_user_id === req.user!.id;
    let isGroupApprover = false;
    if (approval.approver_group_id) {
      const m = await client.query(
        `SELECT 1 FROM assignment_group_members
         WHERE tenant_id = current_tenant_id()
           AND group_id = $1
           AND user_id = $2
         LIMIT 1`,
        [approval.approver_group_id, req.user!.id],
      );
      isGroupApprover = m.rows.length > 0;
    }
    if (!isAdmin && !isDirectApprover && !isGroupApprover && !hasChangeRole(req)) {
      throw new AppError(403, 'Insufficient permissions');
    }

    const { decision, notes } = req.body;
    if (decision === 'approved' || decision === 'waived') {
      const pendingAfterDecision = await client.query(
        `SELECT count(*) AS c
         FROM change_approvals
         WHERE tenant_id = current_tenant_id()
           AND change_id = $1
           AND status = 'pending'
           AND id <> $2`,
        [req.params.id, req.params.approvalId],
      );
      const remainingPending = Number(pendingAfterDecision.rows[0]?.c || 0);
      if (remainingPending === 0) {
        const changeDates = await client.query(
          `SELECT scheduled_start, scheduled_end
           FROM changes
           WHERE tenant_id = current_tenant_id()
             AND id = $1`,
          [req.params.id],
        );
        const readyToApprove = changeDates.rows[0];
        if (!readyToApprove?.scheduled_start || !readyToApprove?.scheduled_end) {
          throw new AppError(400, 'scheduled_start and scheduled_end are required before approval');
        }
      }
    }
    await client.query(
      `UPDATE change_approvals
       SET status = $1::approval_status_enum,
           decided_by = $2,
           decision_notes = $3,
           decided_at = now()
       WHERE tenant_id = current_tenant_id()
         AND id = $4`,
      [decision, req.user!.id, notes || null, approval.id],
    );

    if (decision === 'rejected') {
      await client.query(
        `UPDATE changes
         SET stage = 'approval'::change_stage_enum,
             status = 'rejected'::change_status_enum
         WHERE tenant_id = current_tenant_id()
           AND id = $1`,
        [req.params.id],
      );
    } else {
      const pending = await client.query(
        `SELECT count(*) AS c
         FROM change_approvals
         WHERE tenant_id = current_tenant_id()
           AND change_id = $1
           AND status = 'pending'`,
        [req.params.id],
      );
      if (Number(pending.rows[0]?.c || 0) === 0) {
        await client.query(
          `UPDATE changes
           SET stage = 'planning'::change_stage_enum,
               status = 'approved'::change_status_enum
           WHERE tenant_id = current_tenant_id()
             AND id = $1`,
          [req.params.id],
        );
      }
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
