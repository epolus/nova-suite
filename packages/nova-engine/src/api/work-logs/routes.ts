/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, getRequestClient, releaseTenantClient, setTenantRLS } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { validateBody, validateQuery } from '../../middleware/validate';
import { uuidSchema } from '../../domain/schemas';
import {
  WORK_LOG_ENTITY_TYPES,
  createWorkLog,
  deleteWorkLog,
  isWorkLogEntityType,
  listWorkLogs,
  sumMinutes,
  updateWorkLog,
} from '../../domain/work-logs';
import { hasAnyRole } from '../roles';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

function canManageWorkLogs(req: Request): boolean {
  return hasAnyRole(req, [
    'admin',
    'fulfiller',
    'major_incident_manager',
    'change_manager',
    'problem_manager',
    'problem',
    'catalog_designer',
  ]);
}

const entityTypeSchema = z.enum(WORK_LOG_ENTITY_TYPES);

const listQuerySchema = z.object({
  entity_type: entityTypeSchema,
  entity_id: uuidSchema,
});

const createBodySchema = z.object({
  entity_type: entityTypeSchema,
  entity_id: uuidSchema,
  minutes: z.coerce.number().int().min(1).max(24 * 60),
  worked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(5000).nullable().optional(),
  is_customer_visible: z.boolean().optional(),
});

const updateBodySchema = z.object({
  minutes: z.coerce.number().int().min(1).max(24 * 60).optional(),
  worked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(5000).nullable().optional(),
  is_customer_visible: z.boolean().optional(),
});

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

router.get(
  '/',
  validateQuery(listQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entityType = String(req.query.entity_type);
      const entityId = String(req.query.entity_id);
      if (!isWorkLogEntityType(entityType)) throw new AppError(400, 'Invalid entity_type');
      const client = getRequestClient(req);
      const customerVisibleOnly = !canManageWorkLogs(req);
      const work_logs = await listWorkLogs(client, entityType, entityId, { customerVisibleOnly });
      res.json({
        work_logs,
        total_minutes: sumMinutes(work_logs),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/',
  validateBody(createBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!canManageWorkLogs(req)) throw new AppError(403, 'Insufficient permissions');
      const client = getRequestClient(req);
      const entityType = String(req.body.entity_type);
      if (!isWorkLogEntityType(entityType)) throw new AppError(400, 'Invalid entity_type');
      const row = await createWorkLog(client, {
        entityType,
        entityId: String(req.body.entity_id),
        userId: req.user!.id,
        minutes: Number(req.body.minutes),
        workedOn: req.body.worked_on || todayIsoDate(),
        note: req.body.note === undefined || req.body.note === null
          ? null
          : String(req.body.note).trim() || null,
        isCustomerVisible: Boolean(req.body.is_customer_visible),
      });
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id',
  validateBody(updateBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!canManageWorkLogs(req)) throw new AppError(403, 'Insufficient permissions');
      const client = getRequestClient(req);
      const id = String(req.params.id);
      const existing = await client.query(
        `SELECT id, user_id FROM work_logs WHERE id = $1 LIMIT 1`,
        [id],
      );
      if (existing.rowCount === 0) throw new AppError(404, 'Work log not found');
      const isAdmin = hasAnyRole(req, ['admin']);
      if (!isAdmin && existing.rows[0].user_id !== req.user!.id) {
        throw new AppError(403, 'You can only edit your own work logs');
      }
      const row = await updateWorkLog(client, id, {
        minutes: req.body.minutes !== undefined ? Number(req.body.minutes) : undefined,
        workedOn: req.body.worked_on,
        note: req.body.note === undefined
          ? undefined
          : req.body.note === null
            ? null
            : String(req.body.note).trim() || null,
        isCustomerVisible: req.body.is_customer_visible,
      });
      res.json(row);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageWorkLogs(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const id = String(req.params.id);
    const existing = await client.query(
      `SELECT id, user_id FROM work_logs WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (existing.rowCount === 0) throw new AppError(404, 'Work log not found');
    const isAdmin = hasAnyRole(req, ['admin']);
    if (!isAdmin && existing.rows[0].user_id !== req.user!.id) {
      throw new AppError(403, 'You can only delete your own work logs');
    }
    await deleteWorkLog(client, id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
