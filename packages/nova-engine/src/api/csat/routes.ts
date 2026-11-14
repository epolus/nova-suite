/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, getRequestClient, releaseTenantClient, setTenantRLS } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { validateBody } from '../../middleware/validate';
import { uuidSchema } from '../../domain/schemas';
import {
  getSatisfactionByToken,
  getSatisfactionForIncident,
  submitSatisfactionByToken,
} from '../../domain/satisfaction';
import { hasAnyRole } from '../roles';

const router = Router();

const tokenParam = z.string().min(16).max(128);

const submitBodySchema = z.object({
  score: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(4000).nullable().optional(),
});

const requireAuth = [authenticate, setTenantRLS, releaseTenantClient] as const;

// Agent read — registered before /:token so "incident" is not treated as a token.
router.get(
  '/incident/:incidentId',
  ...requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const incidentId = uuidSchema.parse(req.params.incidentId);
      const client = getRequestClient(req);

      const incident = await client.query(
        `SELECT id FROM incidents WHERE id = $1 LIMIT 1`,
        [incidentId],
      );
      if (incident.rowCount === 0) throw new AppError(404, 'Incident not found');

      const row = await getSatisfactionForIncident(client, incidentId);
      if (!row) {
        res.json({ satisfaction: null });
        return;
      }
      const shareToken = hasAnyRole(req, ['admin', 'fulfiller', 'major_incident_manager']);
      res.json({
        satisfaction: {
          id: row.id,
          incident_id: row.incident_id,
          score: row.score,
          comment: row.comment,
          submitted_at: row.submitted_at,
          created_at: row.created_at,
          token: shareToken ? row.token : undefined,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// Public survey by opaque token (no auth).
router.get('/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = tokenParam.safeParse(String(req.params.token || ''));
    if (!parsed.success) throw new AppError(404, 'Satisfaction survey not found');
    const view = await getSatisfactionByToken(parsed.data);
    res.json(view);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:token',
  validateBody(submitBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = tokenParam.safeParse(String(req.params.token || ''));
      if (!parsed.success) throw new AppError(404, 'Satisfaction survey not found');
      const comment = req.body.comment === undefined || req.body.comment === null
        ? null
        : String(req.body.comment);
      const view = await submitSatisfactionByToken(parsed.data, Number(req.body.score), comment);
      res.json(view);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
