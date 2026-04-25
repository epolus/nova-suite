/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Cart Routes (RLS isolated) ───
// Cart is server-side to prevent cross-user leakage in localStorage.

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, getRequestClient, setTenantRLS, releaseTenantClient } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { z } from 'zod';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

type Priority = 'low' | 'medium' | 'high' | 'critical';

const cartItemSchema = z.object({
  service_item_id: z.string().uuid(),
  form_data: z.record(z.unknown()).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  notes: z.string().optional(),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const r = await client.query(
      `
      SELECT
        COUNT(*)::int AS cart_count,
        COALESCE(SUM(s.price), 0)::numeric AS cart_total
      FROM carts c
      JOIN cart_items ci ON ci.cart_id = c.id
      JOIN service_items s ON s.id = ci.service_item_id
      WHERE c.user_id = current_user_id()
        AND c.tenant_id = current_tenant_id()
      `,
    );

    const summary = r.rows[0] as { cart_count: number; cart_total: string | number };

    const itemsRes = await client.query(
      `
      SELECT
        ci.id,
        ci.priority,
        ci.notes,
        ci.form_data,
        jsonb_build_object(
          'id', s.id,
          'category_id', s.category_id,
          'name', s.name,
          'short_description', s.short_description,
          'description', s.description,
          'icon', s.icon,
          'picture_storage_key', s.picture_storage_key,
          'price', s.price,
          'custom_attributes', s.custom_attributes,
          'form_schema', s.form_schema,
          'approval_required', s.approval_required,
          'sla_hours', s.sla_hours,
          'is_active', s.is_active,
          'category_name', sc.name
        ) AS service_item
      FROM carts c
      JOIN cart_items ci ON ci.cart_id = c.id
      JOIN service_items s ON s.id = ci.service_item_id
      LEFT JOIN service_categories sc ON sc.id = s.category_id
      WHERE c.user_id = current_user_id()
        AND c.tenant_id = current_tenant_id()
      ORDER BY ci.created_at DESC
      `,
    );

    res.json({
      items: itemsRes.rows.map((row: any) => ({
        id: row.id,
        serviceItem: row.service_item,
        formData: row.form_data,
        priority: row.priority,
        notes: row.notes,
      })),
      cartCount: summary ? Number(summary.cart_count) : 0,
      cartTotal: summary ? Number(summary.cart_total) : 0,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/items', validateBody(cartItemSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const {
      service_item_id,
      form_data,
      priority = 'medium',
      notes = '',
    } = req.body;

    // Ensure the service item exists in this tenant
    const svc = await client.query(
      `SELECT id FROM service_items WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [service_item_id],
    );
    if (svc.rows.length === 0) {
      res.status(404).json({ error: 'Service item not found' });
      return;
    }

    const inserted = await client.query(
      `
      WITH upsert_cart AS (
        INSERT INTO carts (tenant_id, user_id)
        VALUES (current_tenant_id(), current_user_id())
        ON CONFLICT (tenant_id, user_id)
        DO UPDATE SET updated_at = NOW()
        RETURNING id
      )
      INSERT INTO cart_items (tenant_id, cart_id, service_item_id, form_data, priority, notes)
      SELECT current_tenant_id(), upsert_cart.id, $1, COALESCE($2::jsonb, '{}'::jsonb), $3, $4
      FROM upsert_cart
      RETURNING id, priority, notes, form_data
      `,
      [service_item_id, JSON.stringify(form_data || {}), priority, notes],
    );

    // Return full cart for simplicity/consistency
    const r = await client.query(
      `
      SELECT
        ci.id,
        ci.priority,
        ci.notes,
        ci.form_data,
        jsonb_build_object(
          'id', s.id,
          'category_id', s.category_id,
          'name', s.name,
          'short_description', s.short_description,
          'description', s.description,
          'icon', s.icon,
          'picture_storage_key', s.picture_storage_key,
          'price', s.price,
          'custom_attributes', s.custom_attributes,
          'form_schema', s.form_schema,
          'approval_required', s.approval_required,
          'sla_hours', s.sla_hours,
          'is_active', s.is_active,
          'category_name', sc.name
        ) AS service_item
      FROM carts c
      JOIN cart_items ci ON ci.cart_id = c.id
      JOIN service_items s ON s.id = ci.service_item_id
      LEFT JOIN service_categories sc ON sc.id = s.category_id
      WHERE c.user_id = current_user_id()
        AND c.tenant_id = current_tenant_id()
      ORDER BY ci.created_at DESC
      `,
    );

    const sum = await client.query(
      `
      SELECT COALESCE(SUM(s.price), 0)::numeric AS cart_total,
             COUNT(*)::int AS cart_count
      FROM carts c
      JOIN cart_items ci ON ci.cart_id = c.id
      JOIN service_items s ON s.id = ci.service_item_id
      WHERE c.user_id = current_user_id()
        AND c.tenant_id = current_tenant_id()
      `,
    );
    const row = sum.rows[0] as any;

    res.status(201).json({
      items: r.rows.map((row: any) => ({
        id: row.id,
        serviceItem: row.service_item,
        formData: row.form_data,
        priority: row.priority,
        notes: row.notes,
      })),
      cartCount: Number(row.cart_count || 0),
      cartTotal: Number(row.cart_total || 0),
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/items/:id', validateBody(z.object({
  form_data: z.record(z.unknown()).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  notes: z.string().optional(),
})), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const { id } = req.params;
    const { form_data, priority, notes } = req.body;

    const sets: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (form_data !== undefined) {
      sets.push(`form_data = $${i++}::jsonb`);
      params.push(JSON.stringify(form_data));
    }
    if (priority !== undefined) {
      sets.push(`priority = $${i++}`);
      params.push(priority);
    }
    if (notes !== undefined) {
      sets.push(`notes = $${i++}`);
      params.push(notes);
    }

    if (sets.length === 0) {
      res.json({ success: true });
      return;
    }

    params.push(id);

    const result = await client.query(
      `
      UPDATE cart_items ci
      SET ${sets.join(', ')},
          updated_at = NOW()
      WHERE ci.id = $${i}
        AND ci.tenant_id = current_tenant_id()
        AND EXISTS (
          SELECT 1 FROM carts c
          WHERE c.id = ci.cart_id
            AND c.user_id = current_user_id()
            AND c.tenant_id = current_tenant_id()
        )
      RETURNING ci.id
      `,
      params,
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Cart item not found' });
      return;
    }

    // Return updated cart
    const itemsRes = await client.query(
      `
      SELECT
        ci.id,
        ci.priority,
        ci.notes,
        ci.form_data,
        jsonb_build_object(
          'id', s.id,
          'category_id', s.category_id,
          'name', s.name,
          'short_description', s.short_description,
          'description', s.description,
          'icon', s.icon,
          'picture_storage_key', s.picture_storage_key,
          'price', s.price,
          'custom_attributes', s.custom_attributes,
          'form_schema', s.form_schema,
          'approval_required', s.approval_required,
          'sla_hours', s.sla_hours,
          'is_active', s.is_active,
          'category_name', sc.name
        ) AS service_item
      FROM carts c
      JOIN cart_items ci ON ci.cart_id = c.id
      JOIN service_items s ON s.id = ci.service_item_id
      LEFT JOIN service_categories sc ON sc.id = s.category_id
      WHERE c.user_id = current_user_id()
        AND c.tenant_id = current_tenant_id()
      ORDER BY ci.created_at DESC
      `,
    );

    const sum = await client.query(
      `
      SELECT COALESCE(SUM(s.price), 0)::numeric AS cart_total,
             COUNT(*)::int AS cart_count
      FROM carts c
      JOIN cart_items ci ON ci.cart_id = c.id
      JOIN service_items s ON s.id = ci.service_item_id
      WHERE c.user_id = current_user_id()
        AND c.tenant_id = current_tenant_id()
      `,
    );
    const sumRow = sum.rows[0] as any;

    res.json({
      items: itemsRes.rows.map((row: any) => ({
        id: row.id,
        serviceItem: row.service_item,
        formData: row.form_data,
        priority: row.priority,
        notes: row.notes,
      })),
      cartCount: Number(sumRow.cart_count || 0),
      cartTotal: Number(sumRow.cart_total || 0),
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/items/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const { id } = req.params;

    await client.query(
      `
      DELETE FROM cart_items ci
      WHERE ci.id = $1
        AND ci.tenant_id = current_tenant_id()
        AND EXISTS (
          SELECT 1 FROM carts c
          WHERE c.id = ci.cart_id
            AND c.user_id = current_user_id()
            AND c.tenant_id = current_tenant_id()
        )
      `,
      [id],
    );

    res.json(await (async () => {
      const itemsRes = await client.query(
        `
        SELECT
          ci.id,
          ci.priority,
          ci.notes,
          ci.form_data,
          jsonb_build_object(
            'id', s.id,
            'category_id', s.category_id,
            'name', s.name,
            'short_description', s.short_description,
            'description', s.description,
            'icon', s.icon,
            'picture_storage_key', s.picture_storage_key,
            'price', s.price,
            'custom_attributes', s.custom_attributes,
            'form_schema', s.form_schema,
            'approval_required', s.approval_required,
            'sla_hours', s.sla_hours,
            'is_active', s.is_active,
            'category_name', sc.name
          ) AS service_item
        FROM carts c
        JOIN cart_items ci ON ci.cart_id = c.id
        JOIN service_items s ON s.id = ci.service_item_id
        LEFT JOIN service_categories sc ON sc.id = s.category_id
        WHERE c.user_id = current_user_id()
          AND c.tenant_id = current_tenant_id()
        ORDER BY ci.created_at DESC
        `,
      );
      const sum = await client.query(
        `
        SELECT COALESCE(SUM(s.price), 0)::numeric AS cart_total,
               COUNT(*)::int AS cart_count
        FROM carts c
        LEFT JOIN cart_items ci ON ci.cart_id = c.id
        LEFT JOIN service_items s ON s.id = ci.service_item_id
        WHERE c.user_id = current_user_id()
          AND c.tenant_id = current_tenant_id()
        `,
      );
      const sumRow = sum.rows[0] as any;
      return {
        items: itemsRes.rows.map((row: any) => ({
          id: row.id,
          serviceItem: row.service_item,
          formData: row.form_data,
          priority: row.priority,
          notes: row.notes,
        })),
        cartCount: Number(sumRow.cart_count || 0),
        cartTotal: Number(sumRow.cart_total || 0),
      };
    })());
  } catch (err) {
    next(err);
  }
});

router.delete('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    await client.query(
      `
      DELETE FROM cart_items ci
      USING carts c
      WHERE ci.cart_id = c.id
        AND c.user_id = current_user_id()
        AND c.tenant_id = current_tenant_id()
      `,
    );
    res.json({ items: [], cartCount: 0, cartTotal: 0 });
  } catch (err) {
    next(err);
  }
});

export default router;

