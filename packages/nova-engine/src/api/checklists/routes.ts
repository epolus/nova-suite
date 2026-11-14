/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  authenticate,
  getRequestClient,
  releaseTenantClient,
  requireRole,
  setTenantRLS,
} from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { validateBody, validateQuery } from '../../middleware/validate';
import { uuidSchema } from '../../domain/schemas';
import {
  applyChecklistTemplate,
  CHECKLIST_ENTITY_TYPES,
  createChecklistTemplate,
  getChecklistTemplate,
  isChecklistEntityType,
  listChecklistInstances,
  listChecklistTemplates,
  removeChecklistInstance,
  setChecklistItemDone,
  softDeleteChecklistTemplate,
  updateChecklistTemplate,
} from '../../domain/checklists';
import { hasAnyRole } from '../roles';

const entityTypeSchema = z.enum(CHECKLIST_ENTITY_TYPES);

const templateItemSchema = z.object({
  label: z.string().min(1).max(500),
  sort_order: z.coerce.number().int().optional(),
  required: z.boolean().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  entity_type: entityTypeSchema,
  description: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
  items: z.array(templateItemSchema).min(1),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
  items: z.array(templateItemSchema).min(1).optional(),
});

const listQuerySchema = z.object({
  entity_type: entityTypeSchema.optional(),
  entity_id: uuidSchema.optional(),
});

const applyBodySchema = z.object({
  entity_type: entityTypeSchema,
  entity_id: uuidSchema,
  template_id: uuidSchema,
});

const toggleBodySchema = z.object({
  is_done: z.boolean(),
});

function canManageChecklists(req: Request): boolean {
  return hasAnyRole(req, [
    'admin',
    'fulfiller',
    'change_manager',
    'major_incident_manager',
  ]);
}

/** Admin CRUD — /api/admin/checklist-templates */
const adminRouter = Router();
adminRouter.use(authenticate, requireRole('admin', 'checklist_admin'), setTenantRLS, releaseTenantClient);

adminRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rawEntityType = req.query.entity_type
      ? String(req.query.entity_type)
      : undefined;
    if (rawEntityType !== undefined && !isChecklistEntityType(rawEntityType)) {
      throw new AppError(400, 'Invalid entity_type');
    }
    const includeInactive = String(req.query.include_inactive || '') === 'true';
    const templates = await listChecklistTemplates(client, {
      entityType: rawEntityType && isChecklistEntityType(rawEntityType) ? rawEntityType : undefined,
      includeInactive,
    });
    res.json({ checklist_templates: templates });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const template = await getChecklistTemplate(client, String(req.params.id));
    if (!template) throw new AppError(404, 'Checklist template not found');
    res.json(template);
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/',
  validateBody(createTemplateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const template = await createChecklistTemplate(client, {
        name: req.body.name,
        entityType: req.body.entity_type,
        description: req.body.description,
        isActive: req.body.is_active,
        items: req.body.items,
      });
      res.status(201).json(template);
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/:id',
  validateBody(updateTemplateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const template = await updateChecklistTemplate(client, String(req.params.id), {
        name: req.body.name,
        description: req.body.description,
        isActive: req.body.is_active,
        items: req.body.items,
      });
      res.json(template);
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    await softDeleteChecklistTemplate(client, String(req.params.id));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/** Agent/instance API — /api/checklists */
const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

router.get(
  '/templates',
  validateQuery(z.object({
    entity_type: entityTypeSchema.optional(),
  })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const rawEntityType = req.query.entity_type
        ? String(req.query.entity_type)
        : undefined;
      const templates = await listChecklistTemplates(client, {
        entityType: rawEntityType && isChecklistEntityType(rawEntityType) ? rawEntityType : undefined,
        includeInactive: false,
      });
      res.json({ checklist_templates: templates });
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
      const entityType = String(req.query.entity_type || '');
      const entityId = String(req.query.entity_id || '');
      if (!isChecklistEntityType(entityType)) throw new AppError(400, 'entity_type is required');
      if (!entityId) throw new AppError(400, 'entity_id is required');
      const client = getRequestClient(req);
      await assertEntityReadable(client, entityType, entityId);
      const instances = await listChecklistInstances(client, entityType, entityId);
      res.json({ checklist_instances: instances });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/apply',
  validateBody(applyBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!canManageChecklists(req)) throw new AppError(403, 'Insufficient permissions');
      const client = getRequestClient(req);
      const instance = await applyChecklistTemplate(client, {
        entityType: req.body.entity_type,
        entityId: req.body.entity_id,
        templateId: req.body.template_id,
      });
      res.status(201).json(instance);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/items/:itemId',
  validateBody(toggleBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!canManageChecklists(req)) throw new AppError(403, 'Insufficient permissions');
      const client = getRequestClient(req);
      const item = await setChecklistItemDone(
        client,
        String(req.params.itemId),
        Boolean(req.body.is_done),
        req.user!.id,
      );
      res.json(item);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/instances/:instanceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageChecklists(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    await removeChecklistInstance(client, String(req.params.instanceId));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

async function assertEntityReadable(
  client: import('pg').PoolClient,
  entityType: 'incident' | 'change',
  entityId: string,
): Promise<void> {
  const table = entityType === 'incident' ? 'incidents' : 'changes';
  const r = await client.query(
    `SELECT 1 FROM ${table} WHERE id = $1 LIMIT 1`,
    [entityId],
  );
  if (r.rowCount === 0) throw new AppError(404, `${entityType} not found`);
}

export { adminRouter as checklistTemplatesAdminRoutes };
export default router;
