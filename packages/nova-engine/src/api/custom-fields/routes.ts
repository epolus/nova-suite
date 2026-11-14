/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, getRequestClient, releaseTenantClient, setTenantRLS } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import {
  isCustomFieldEntityType,
  listFieldDefinitions,
  listFieldOptions,
  loadCustomFieldsMap,
} from '../../domain/custom-fields';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

/** Active definitions (+ options) for form rendering. */
router.get('/:entityType', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entityType = String(req.params.entityType);
    if (!isCustomFieldEntityType(entityType)) {
      throw new AppError(400, 'entityType must be incident, change, or asset');
    }
    const client = getRequestClient(req);
    const includeInactive = String((req.query as Record<string, unknown>).include_inactive ?? '') === 'true';
    const definitions = await listFieldDefinitions(client, entityType, {
      activeOnly: !includeInactive,
    });
    const options = await listFieldOptions(client, definitions.map((d) => d.id), {
      activeOnly: !includeInactive,
    });
    const optionsByField = new Map<string, typeof options>();
    for (const opt of options) {
      const list = optionsByField.get(opt.field_id) ?? [];
      list.push(opt);
      optionsByField.set(opt.field_id, list);
    }
    res.json({
      definitions: definitions.map((d) => ({
        ...d,
        options: (optionsByField.get(d.id) ?? []).map((o) => ({
          id: o.id,
          value: o.value,
          label: o.label,
          sort_order: o.sort_order,
          is_active: o.is_active,
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** Values for one entity. */
router.get('/:entityType/:entityId/values', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entityType = String(req.params.entityType);
    const entityId = String(req.params.entityId);
    if (!isCustomFieldEntityType(entityType)) {
      throw new AppError(400, 'entityType must be incident, change, or asset');
    }
    const client = getRequestClient(req);
    const custom_fields = await loadCustomFieldsMap(client, entityType, entityId);
    res.json({ custom_fields });
  } catch (err) {
    next(err);
  }
});

export default router;
