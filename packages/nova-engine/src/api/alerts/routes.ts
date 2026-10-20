/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { AppError } from '../../middleware/errorHandler';
import { authenticate, releaseTenantClient, setTenantRLS } from '../../middleware/auth';
import { validateQuery } from '../../middleware/validate';
import { db } from '../../data/db';
import { paginationSchema } from '../../domain/schemas';
import { canManageAlertDefinitions, canViewAlerts } from '../roles';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);
router.use((req, _res, next) => {
  if (!canViewAlerts(req)) {
    next(new AppError(403, 'Insufficient permissions'));
    return;
  }
  next();
});

function labelObject(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' || typeof value === 'number') out[key] = String(value);
  }
  return out;
}

function optionalText(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  return value || null;
}

const ALERT_SORT: Record<string, string> = {
  number: 'a.number',
  title: 'a.title',
  severity: 'a.severity',
  status: 'a.status',
  source: 'a.source',
  ci_name: 'ci.name',
  incident_number: 'i.number',
  event_count: 'a.event_count',
  first_seen_at: 'a.first_seen_at',
  last_seen_at: 'a.last_seen_at',
};

const ALERT_COLUMN_FILTERS: Record<string, string> = {
  number: 'a.number',
  title: 'a.title',
  severity: 'a.severity',
  status: 'a.status',
  source: 'a.source',
  ci_name: 'ci.name',
  incident_number: 'i.number',
  event_count: 'a.event_count::text',
  first_seen_at: 'a.first_seen_at::text',
  last_seen_at: 'a.last_seen_at::text',
};

router.get('/', validateQuery(paginationSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const conditions = ['a.tenant_id = current_tenant_id()'];
    const params: unknown[] = [];
    const status = optionalText(req.query.status);
    if (status === 'firing' || status === 'resolved') {
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    } else if (status !== 'all') {
      params.push('firing');
      conditions.push(`a.status = $${params.length}`);
    }
    const search = optionalText(req.query.search);
    if (search) {
      params.push(`%${search}%`);
      const ref = `$${params.length}`;
      conditions.push(`(a.number ILIKE ${ref} OR a.title ILIKE ${ref} OR a.source ILIKE ${ref} OR a.fingerprint ILIKE ${ref} OR ci.name ILIKE ${ref} OR i.number ILIKE ${ref})`);
    }
    for (const [key, value] of Object.entries(req.query)) {
      if (!key.startsWith('cf.') || typeof value !== 'string' || !value) continue;
      const column = ALERT_COLUMN_FILTERS[key.slice(3)];
      if (!column) continue;
      params.push(`${value}%`);
      conditions.push(`${column} ILIKE $${params.length}`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const from = `FROM alerts a
       LEFT JOIN incidents i ON i.id = a.incident_id
       LEFT JOIN configuration_items ci ON ci.id = a.configuration_item_id`;
    const count = await db.getOne<{ count: string }>(`SELECT count(*)::text AS count ${from} ${where}`, params);
    const total = Number(count?.count || 0);
    const sortCol = ALERT_SORT[String(req.query.sort_by || '')];
    const sortDir = req.query.sort_dir === 'asc' ? 'ASC' : 'DESC';
    const order = sortCol ? `ORDER BY ${sortCol} ${sortDir}` : 'ORDER BY a.last_seen_at DESC';
    params.push(limit, offset);
    const rows = await db.getMany(
      `SELECT a.id, a.number, a.source, a.status, a.severity, a.title, a.event_count,
              a.first_seen_at, a.last_seen_at, a.resolved_at, a.source_url, a.suppressed_reason,
              a.incident_id, i.number AS incident_number, ci.name AS ci_name
       ${from}
       ${where}
       ${order}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json({ alerts: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

router.get('/assignment-groups', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageAlertDefinitions(req)) throw new AppError(403, 'Insufficient permissions');
    const rows = await db.getMany(
      `SELECT id, name
       FROM assignment_groups
       WHERE tenant_id = current_tenant_id() AND is_active = true
       ORDER BY name`,
    );
    res.json({ assignment_groups: rows });
  } catch (err) { next(err); }
});

router.get('/definitions', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageAlertDefinitions(_req)) throw new AppError(403, 'Insufficient permissions');
    const rows = await db.getMany(
      `SELECT id, name, description, is_active, sort_order, source, severity, match_labels, severity_map,
              action, assignment_group_id, impact, urgency, workflow_key, created_at, updated_at
       FROM alert_definitions
       WHERE tenant_id = current_tenant_id()
       ORDER BY sort_order, name`,
    );
    res.json({ alert_definitions: rows });
  } catch (err) { next(err); }
});

router.post('/definitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageAlertDefinitions(req)) throw new AppError(403, 'Insufficient permissions');
    const name = optionalText(req.body?.name);
    if (!name) throw new AppError(400, 'name is required');
    const action = optionalText(req.body?.action) || 'none';
    if (action !== 'none' && action !== 'incident' && action !== 'workflow') {
      throw new AppError(400, 'action must be none, incident, or workflow');
    }
    const impact = optionalText(req.body?.impact);
    const urgency = optionalText(req.body?.urgency);
    if ((impact && !['low', 'medium', 'high'].includes(impact)) || (urgency && !['low', 'medium', 'high'].includes(urgency))) {
      throw new AppError(400, 'impact and urgency must be low, medium, or high');
    }
    const workflowKey = action === 'workflow' ? 'notification_dispatch' : null;
    const row = await db.getOne(
      `INSERT INTO alert_definitions (
         tenant_id, name, description, is_active, sort_order, source, severity, match_labels, severity_map,
         action, assignment_group_id, impact, urgency, workflow_key
       ) VALUES (
         current_tenant_id(), $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb,
         $9, $10, $11, $12, $13
       )
       RETURNING id, name, action, is_active`,
      [
        name,
        optionalText(req.body?.description),
        req.body?.is_active !== false,
        Number.isFinite(Number(req.body?.sort_order)) ? Number(req.body.sort_order) : 100,
        optionalText(req.body?.source),
        optionalText(req.body?.severity),
        JSON.stringify(labelObject(req.body?.match_labels)),
        req.body?.severity_map ? JSON.stringify(labelObject(req.body.severity_map)) : null,
        action,
        optionalText(req.body?.assignment_group_id),
        impact,
        urgency,
        workflowKey,
      ],
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch('/definitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageAlertDefinitions(req)) throw new AppError(403, 'Insufficient permissions');
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (req.body?.name !== undefined) {
      const name = optionalText(req.body.name);
      if (!name) throw new AppError(400, 'name is required');
      sets.push(`name = $${i++}`);
      vals.push(name);
    }
    if (req.body?.is_active !== undefined) {
      sets.push(`is_active = $${i++}`);
      vals.push(Boolean(req.body.is_active));
    }
    if (req.body?.description !== undefined) {
      sets.push(`description = $${i++}`);
      vals.push(optionalText(req.body.description));
    }
    if (req.body?.action !== undefined) {
      const action = optionalText(req.body.action);
      if (action !== 'none' && action !== 'incident' && action !== 'workflow') {
        throw new AppError(400, 'action must be none, incident, or workflow');
      }
      sets.push(`action = $${i++}`);
      vals.push(action);
      if (action === 'workflow') {
        sets.push(`workflow_key = $${i++}`);
        vals.push('notification_dispatch');
      }
      if (action !== 'workflow') {
        sets.push('workflow_key = NULL');
      }
    }
    if (sets.length === 0) {
      res.json({ success: true });
      return;
    }
    vals.push(req.params.id);
    const result = await db.query(
      `UPDATE alert_definitions SET ${sets.join(', ')}
       WHERE id = $${i} AND tenant_id = current_tenant_id()
       RETURNING id`,
      vals,
    );
    if (result.rowCount === 0) throw new AppError(404, 'Alert definition not found');
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new AppError(404, 'Alert not found');
    }
    const alert = await db.getOne(
      `SELECT a.id, a.number, a.source, a.fingerprint, a.status, a.severity, a.title, a.labels,
              a.event_count, a.first_seen_at, a.last_seen_at, a.resolved_at, a.source_url,
              a.suppressed_reason, a.incident_id, i.number AS incident_number,
              a.configuration_item_id, ci.name AS ci_name, d.name AS definition_name
       FROM alerts a
       LEFT JOIN incidents i ON i.id = a.incident_id
       LEFT JOIN configuration_items ci ON ci.id = a.configuration_item_id
       LEFT JOIN alert_definitions d ON d.id = a.definition_id
       WHERE a.id = $1 AND a.tenant_id = current_tenant_id()`,
      [id],
    );
    if (!alert) throw new AppError(404, 'Alert not found');
    const events = await db.getMany(
      `SELECT id, status, severity, title, occurred_at, received_at, source_url
       FROM events
       WHERE alert_id = $1 AND tenant_id = current_tenant_id()
       ORDER BY received_at DESC
       LIMIT 100`,
      [id],
    );
    res.json({ alert, events });
  } catch (err) { next(err); }
});

export default router;
