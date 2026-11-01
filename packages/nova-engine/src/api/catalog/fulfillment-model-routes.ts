/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { parseFulfillmentModelConfig, type FulfillmentModelConfig } from '@nova-suite/shared';
import { requireRole, getRequestClient } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { fulfillmentModelUpdateSchema, fulfillmentModelWriteSchema } from '../../domain/schemas';
import { BadRequest, Conflict, NotFound } from '../../middleware/errorHandler';
import type { PoolClient } from 'pg';

const router = Router();

const MODEL_SELECT = `
  SELECT fm.*,
         task_groups.names AS task_group_names,
         cc.display_name AS ci_class_name,
         (SELECT count(*)::int FROM service_items si WHERE si.fulfillment_model_id = fm.id) AS item_count
  FROM fulfillment_models fm
  LEFT JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(ag.name ORDER BY src.ord), '[]'::jsonb) AS names
    FROM (
      SELECT elem AS task, ord
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(fm.config->'tasks') = 'array' THEN fm.config->'tasks'
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS t(elem, ord)
    ) src
    LEFT JOIN assignment_groups ag ON ag.id::text = src.task->>'assigned_group_id'
  ) task_groups ON true
  LEFT JOIN ci_classes cc ON cc.id::text = fm.config #>> '{ci,class_id}'
`;

function presentModel<T extends { config: unknown }>(row: T): T {
  const config = parseFulfillmentModelConfig(row.config);
  return config ? { ...row, config } : row;
}

async function assertConfigReferences(client: PoolClient, config: FulfillmentModelConfig): Promise<void> {
  const groupIds = [...new Set(config.tasks.map((task) => task.assigned_group_id).filter((id): id is string => Boolean(id)))];
  if (groupIds.length > 0) {
    const group = await client.query(
      `SELECT id FROM assignment_groups WHERE id = ANY($1::uuid[])`,
      [groupIds],
    );
    if (group.rows.length !== groupIds.length) throw BadRequest('Assignment group not found');
  }
  if (config.ci.enabled && config.ci.class_id) {
    const ciClass = await client.query(
      `SELECT id FROM ci_classes WHERE id = $1`,
      [config.ci.class_id],
    );
    if (ciClass.rows.length === 0) throw BadRequest('CI class not found');
  }
}

function parsedConfig(value: unknown): FulfillmentModelConfig {
  const config = parseFulfillmentModelConfig(value);
  if (!config) throw BadRequest('Fulfillment model config is invalid');
  return config;
}

router.get('/', requireRole('admin', 'catalog_designer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(`${MODEL_SELECT} ORDER BY fm.name`);
    res.json({ fulfillment_models: result.rows.map((row: { config: unknown }) => presentModel(row)) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireRole('admin', 'catalog_designer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(`${MODEL_SELECT} WHERE fm.id = $1`, [req.params.id]);
    if (result.rows.length === 0) throw NotFound('Fulfillment model not found');
    res.json(presentModel(result.rows[0] as { config: unknown }));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requireRole('admin', 'catalog_designer'),
  validateBody(fulfillmentModelWriteSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const config = parsedConfig(req.body.config);
      await assertConfigReferences(client, config);
      const result = await client.query(
        `INSERT INTO fulfillment_models (tenant_id, name, description, config, is_active)
         VALUES (current_tenant_id(), $1, $2, $3::jsonb, $4)
         RETURNING *`,
        [req.body.name, req.body.description || null, JSON.stringify(config), req.body.is_active !== false],
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/:id',
  requireRole('admin', 'catalog_designer'),
  validateBody(fulfillmentModelUpdateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const existing = await client.query(
        `SELECT * FROM fulfillment_models WHERE id = $1`,
        [req.params.id],
      );
      if (existing.rows.length === 0) throw NotFound('Fulfillment model not found');
      const current = existing.rows[0] as {
        name: string;
        description: string | null;
        config: unknown;
        is_active: boolean;
      };
      const config = req.body.config === undefined ? parseFulfillmentModelConfig(current.config) : parsedConfig(req.body.config);
      if (!config) throw BadRequest('Fulfillment model config is invalid');
      await assertConfigReferences(client, config);
      const result = await client.query(
        `UPDATE fulfillment_models SET
           name = $1,
           description = $2,
           config = $3::jsonb,
           is_active = $4,
           updated_at = now()
         WHERE id = $5
         RETURNING *`,
        [
          req.body.name ?? current.name,
          Object.prototype.hasOwnProperty.call(req.body, 'description') ? (req.body.description || null) : current.description,
          JSON.stringify(config),
          req.body.is_active === undefined ? current.is_active : req.body.is_active,
          req.params.id,
        ],
      );
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', requireRole('admin', 'catalog_designer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const used = await client.query(
      `SELECT count(*)::int AS count FROM service_items WHERE fulfillment_model_id = $1`,
      [req.params.id],
    );
    if ((used.rows[0]?.count ?? 0) > 0) {
      throw Conflict('Fulfillment model is used by a service item');
    }
    const result = await client.query(
      `DELETE FROM fulfillment_models WHERE id = $1 RETURNING id`,
      [req.params.id],
    );
    if (result.rows.length === 0) throw NotFound('Fulfillment model not found');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
