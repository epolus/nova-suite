/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  authenticate,
  getRequestClient,
  releaseTenantClient,
  setTenantRLS,
} from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { validateBody, validateQuery } from '../../middleware/validate';
import { uuidSchema } from '../../domain/schemas';
import {
  createRotaShift,
  deleteRotaShift,
  getOnCallUserForGroup,
  listRotaShifts,
  updateRotaShift,
} from '../../domain/rota';
import { canManageOnCallRota, canViewOnCallRota } from '../roles';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

const listQuerySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  assignment_group_id: uuidSchema.optional(),
});

const createBodySchema = z.object({
  assignment_group_id: uuidSchema,
  user_id: uuidSchema,
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  notes: z.string().max(5000).nullable().optional(),
});

const updateBodySchema = createBodySchema.partial();

const onCallQuerySchema = z.object({
  assignment_group_id: uuidSchema,
  at: z.string().optional(),
});

router.get('/shifts', validateQuery(listQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canViewOnCallRota(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const shifts = await listRotaShifts(client, {
      from: String(req.query.from),
      to: String(req.query.to),
      assignmentGroupId: req.query.assignment_group_id
        ? String(req.query.assignment_group_id)
        : null,
    });
    res.json({ shifts });
  } catch (err) {
    next(err);
  }
});

router.get('/on-call', validateQuery(onCallQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canViewOnCallRota(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const covering = await getOnCallUserForGroup(
      client,
      String(req.query.assignment_group_id),
      req.query.at ? String(req.query.at) : new Date(),
    );
    res.json({ on_call: covering });
  } catch (err) {
    next(err);
  }
});

router.post('/shifts', validateBody(createBodySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageOnCallRota(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const shift = await createRotaShift(client, {
      assignmentGroupId: req.body.assignment_group_id,
      userId: req.body.user_id,
      startsAt: req.body.starts_at,
      endsAt: req.body.ends_at,
      notes: req.body.notes,
      createdBy: req.user!.id,
    });
    res.status(201).json(shift);
  } catch (err) {
    next(err);
  }
});

router.patch('/shifts/:id', validateBody(updateBodySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageOnCallRota(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const shift = await updateRotaShift(client, String(req.params.id), {
      assignmentGroupId: req.body.assignment_group_id,
      userId: req.body.user_id,
      startsAt: req.body.starts_at,
      endsAt: req.body.ends_at,
      notes: req.body.notes,
    });
    res.json(shift);
  } catch (err) {
    next(err);
  }
});

router.delete('/shifts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageOnCallRota(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    await deleteRotaShift(client, String(req.params.id));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
