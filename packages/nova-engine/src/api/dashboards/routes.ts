/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, getRequestClient, setTenantRLS, releaseTenantClient } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { AppError, NotFound } from '../../middleware/errorHandler';
import { uuidSchema } from '../../domain/schemas';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

const MAX_USER_DASHBOARDS = 10;
const LEGACY_LAYOUT_SCOPE = 'ui:dashboard';

const widgetInstanceSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.string(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
});

const layoutSchema = z.object({
  version: z.literal(1),
  widgets: z.array(widgetInstanceSchema),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  layout: layoutSchema.optional(),
  is_default: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  layout: layoutSchema.optional(),
  is_default: z.boolean().optional(),
});

type DashboardLayout = z.infer<typeof layoutSchema>;

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    layout: row.layout,
    is_default: row.is_default,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseLegacyLayout(raw: unknown): DashboardLayout {
  const fallback: DashboardLayout = { version: 1, widgets: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;

  const obj = raw as Record<string, unknown>;
  if (obj.value && typeof obj.value === 'object' && !Array.isArray(obj.value)) {
    const parsed = layoutSchema.safeParse(obj.value);
    return parsed.success ? parsed.data : fallback;
  }

  const parsed = layoutSchema.safeParse(obj);
  return parsed.success ? parsed.data : fallback;
}

async function ensureInitialDashboard(req: Request): Promise<void> {
  const client = getRequestClient(req);
  const countRes = await client.query(
    `SELECT COUNT(*)::int AS c
     FROM user_dashboards
     WHERE tenant_id = current_tenant_id()
       AND user_id = current_user_id()`,
  );
  if (Number(countRes.rows[0]?.c) > 0) return;

  const prefRes = await client.query(
    `SELECT value
     FROM user_preferences
     WHERE tenant_id = current_tenant_id()
       AND user_id = current_user_id()
       AND scope = $1`,
    [LEGACY_LAYOUT_SCOPE],
  );

  const layout = parseLegacyLayout(prefRes.rows[0]?.value);

  await client.query(
    `INSERT INTO user_dashboards (tenant_id, user_id, name, layout, is_default, sort_order)
     VALUES (current_tenant_id(), current_user_id(), $1, $2::jsonb, true, 0)`,
    ['My Dashboard', JSON.stringify(layout)],
  );
}

async function clearDefaultDashboards(req: Request): Promise<void> {
  const client = getRequestClient(req);
  await client.query(
    `UPDATE user_dashboards
     SET is_default = false, updated_at = NOW()
     WHERE tenant_id = current_tenant_id()
       AND user_id = current_user_id()
       AND is_default = true`,
  );
}

async function promoteFallbackDefault(req: Request, excludeId: string): Promise<void> {
  const client = getRequestClient(req);
  await client.query(
    `UPDATE user_dashboards
     SET is_default = true, updated_at = NOW()
     WHERE id = (
       SELECT id
       FROM user_dashboards
       WHERE tenant_id = current_tenant_id()
         AND user_id = current_user_id()
         AND id <> $1
       ORDER BY sort_order ASC, created_at ASC
       LIMIT 1
     )`,
    [excludeId],
  );
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureInitialDashboard(req);
    const client = getRequestClient(req);
    const result = await client.query(
      `SELECT id, name, layout, is_default, sort_order, created_at, updated_at
       FROM user_dashboards
       WHERE tenant_id = current_tenant_id()
         AND user_id = current_user_id()
       ORDER BY sort_order ASC, created_at ASC`,
    );
    res.json({ dashboards: result.rows.map(mapRow) });
  } catch (err) {
    next(err);
  }
});

router.post('/', validateBody(createSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    await ensureInitialDashboard(req);

    const countRes = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM user_dashboards
       WHERE tenant_id = current_tenant_id()
         AND user_id = current_user_id()`,
    );
    if (Number(countRes.rows[0]?.c) >= MAX_USER_DASHBOARDS) {
      throw new AppError(400, `Maximum of ${MAX_USER_DASHBOARDS} dashboards allowed`);
    }

    const { name, layout, is_default: makeDefault = false } = req.body;
    const nextLayout: DashboardLayout = layout ?? { version: 1, widgets: [] };

    const orderRes = await client.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
       FROM user_dashboards
       WHERE tenant_id = current_tenant_id()
         AND user_id = current_user_id()`,
    );
    const sortOrder = Number(orderRes.rows[0]?.next_order ?? 0);

    const defaultRes = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM user_dashboards
       WHERE tenant_id = current_tenant_id()
         AND user_id = current_user_id()
         AND is_default = true`,
    );
    const hasDefault = Number(defaultRes.rows[0]?.c) > 0;

    if (makeDefault) {
      await clearDefaultDashboards(req);
    }

    const shouldDefault = makeDefault || !hasDefault;

    const insertRes = await client.query(
      `INSERT INTO user_dashboards (tenant_id, user_id, name, layout, is_default, sort_order)
       VALUES (current_tenant_id(), current_user_id(), $1, $2::jsonb, $3, $4)
       RETURNING id, name, layout, is_default, sort_order, created_at, updated_at`,
      [name, JSON.stringify(nextLayout), shouldDefault, sortOrder],
    );

    res.status(201).json({ dashboard: mapRow(insertRes.rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validateBody(updateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const client = getRequestClient(req);
    const existing = await client.query(
      `SELECT id, is_default
       FROM user_dashboards
       WHERE id = $1
         AND tenant_id = current_tenant_id()
         AND user_id = current_user_id()`,
      [id],
    );
    if (existing.rows.length === 0) throw NotFound('Dashboard not found');

    const { name, layout, is_default: makeDefault } = req.body;
    if (name === undefined && layout === undefined && makeDefault === undefined) {
      throw new AppError(400, 'No fields to update');
    }

    if (makeDefault === true) {
      await clearDefaultDashboards(req);
    }

    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [id];
    let paramIndex = 2;

    if (name !== undefined) {
      sets.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (layout !== undefined) {
      sets.push(`layout = $${paramIndex++}::jsonb`);
      params.push(JSON.stringify(layout));
    }
    if (makeDefault === true) {
      sets.push('is_default = true');
    }

    const updateRes = await client.query(
      `UPDATE user_dashboards
       SET ${sets.join(', ')}
       WHERE id = $1
         AND tenant_id = current_tenant_id()
         AND user_id = current_user_id()
       RETURNING id, name, layout, is_default, sort_order, created_at, updated_at`,
      params,
    );

    res.json({ dashboard: mapRow(updateRes.rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const client = getRequestClient(req);

    const countRes = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM user_dashboards
       WHERE tenant_id = current_tenant_id()
         AND user_id = current_user_id()`,
    );
    if (Number(countRes.rows[0]?.c) <= 1) {
      throw new AppError(400, 'Cannot delete your only dashboard');
    }

    const existing = await client.query(
      `SELECT id, is_default
       FROM user_dashboards
       WHERE id = $1
         AND tenant_id = current_tenant_id()
         AND user_id = current_user_id()`,
      [id],
    );
    if (existing.rows.length === 0) throw NotFound('Dashboard not found');

    const wasDefault = Boolean(existing.rows[0].is_default);

    await client.query(
      `DELETE FROM user_dashboards
       WHERE id = $1
         AND tenant_id = current_tenant_id()
         AND user_id = current_user_id()`,
      [id],
    );

    if (wasDefault) {
      await promoteFallbackDefault(req, id);
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
