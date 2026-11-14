/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, getRequestClient, releaseTenantClient, setTenantRLS } from '../../middleware/auth';
import { AppError, NotFound } from '../../middleware/errorHandler';
import { validateBody, validateQuery } from '../../middleware/validate';
import { uuidSchema } from '../../domain/schemas';
import {
  RECORD_LINK_ENTITY_TYPES,
  RECORD_LINK_TYPES,
  createRecordLink,
  deleteRecordLink,
  isRecordLinkEntityType,
  listRecordLinks,
  searchRecordLinkTargets,
} from '../../domain/record-links';
import { hasAnyRole } from '../roles';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

/** Align with nova-web isAgentRole — portal-only users are read-only. */
function canManageRecordLinks(req: Request): boolean {
  return hasAnyRole(req, [
    'admin',
    'fulfiller',
    'major_incident_manager',
    'configuration_manager',
    'catalog_designer',
    'credential_manager',
    'change_manager',
    'problem_manager',
    'problem',
    'report_viewer',
    'report_creator',
    'report_admin',
    'event_operator',
    'event_manager',
    'data_manager',
  ]);
}

const entityTypeSchema = z.enum(RECORD_LINK_ENTITY_TYPES);
const linkTypeSchema = z.enum(RECORD_LINK_TYPES);

const listQuerySchema = z.object({
  entity_type: entityTypeSchema,
  entity_id: uuidSchema,
});

const searchQuerySchema = z.object({
  entity_type: entityTypeSchema,
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

const createBodySchema = z.object({
  source_type: entityTypeSchema,
  source_id: uuidSchema,
  target_type: entityTypeSchema,
  target_id: uuidSchema,
  link_type: linkTypeSchema.default('related'),
});

router.get(
  '/search',
  validateQuery(searchQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entityType = String(req.query.entity_type);
      const q = String(req.query.q);
      const limit = req.query.limit != null ? Number(req.query.limit) : 15;
      if (!isRecordLinkEntityType(entityType)) {
        throw new AppError(400, 'Invalid entity_type');
      }
      const client = getRequestClient(req);
      const results = await searchRecordLinkTargets(client, entityType, q, limit);
      res.json({ results });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/',
  validateQuery(listQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entityType = String(req.query.entity_type);
      const entityId = String(req.query.entity_id);
      if (!isRecordLinkEntityType(entityType)) {
        throw new AppError(400, 'Invalid entity_type');
      }
      const client = getRequestClient(req);
      const links = await listRecordLinks(client, entityType, entityId);
      res.json({ links });
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
      if (!canManageRecordLinks(req)) {
        throw new AppError(403, 'Only agents can create record links');
      }
      const client = getRequestClient(req);
      const body = req.body as z.infer<typeof createBodySchema>;
      const link = await createRecordLink(client, {
        source_type: body.source_type,
        source_id: body.source_id,
        target_type: body.target_type,
        target_id: body.target_id,
        link_type: body.link_type,
        created_by: req.user?.id || null,
      });
      res.status(201).json(link);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageRecordLinks(req)) {
      throw new AppError(403, 'Only agents can delete record links');
    }
    const client = getRequestClient(req);
    const deleted = await deleteRecordLink(client, String(req.params.id));
    if (!deleted) throw NotFound('Record link not found');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
