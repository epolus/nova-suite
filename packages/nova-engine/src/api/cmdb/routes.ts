/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – CMDB Routes ───
// CI Classes:
//   GET    /api/cmdb/classes
//   POST   /api/cmdb/classes
// Configuration Items:
//   GET    /api/cmdb/items
//   POST   /api/cmdb/items
//   GET    /api/cmdb/items/:id
//   PATCH  /api/cmdb/items/:id
//   GET    /api/cmdb/items/:id/history
//   GET    /api/cmdb/items/:id/impact
// Relationships:
//   GET    /api/cmdb/relationships
//   POST   /api/cmdb/relationships
//   DELETE /api/cmdb/relationships/:id

import { Router, Request, Response, NextFunction } from 'express';
import {
  authenticate,
  requireRole,
  getRequestClient,
  setTenantRLS,
  releaseTenantClient,
} from '../../middleware/auth';
import { validateBody, validateQuery } from '../../middleware/validate';
import {
  createCIClassSchema,
  updateCIClassSchema,
  createCISchema,
  updateCISchema,
  createCIRelationshipSchema,
  paginationSchema,
} from '../../domain/schemas';
import { NotFound, Conflict } from '../../middleware/errorHandler';
import { hasConfigurationRole, isFulfillerRole } from '../roles';

const router = Router();

// All CMDB routes require auth + tenant context
router.use(authenticate, setTenantRLS, releaseTenantClient);

// ════════════════════════════════════════
// CI CLASSES
// ════════════════════════════════════════

// ─── GET /api/cmdb/classes ───
router.get('/classes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query('SELECT * FROM ci_classes ORDER BY display_name');
    res.json({ classes: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/cmdb/classes ───
router.post(
  '/classes',
  requireRole('admin', 'configuration_manager'),
  validateBody(createCIClassSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { name, display_name, description, parent_class, attributes, icon, is_active } = req.body;

      const result = await client.query(
        `INSERT INTO ci_classes (
          tenant_id, name, display_name, description, parent_class, attributes, icon, is_active
        ) VALUES (
          current_tenant_id(), $1, $2, $3, $4, $5, $6, $7
        ) RETURNING *`,
        [name, display_name, description || null, parent_class || null, JSON.stringify(attributes), icon || 'server', is_active ?? true],
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /api/cmdb/classes/:id ───
router.put(
  '/classes/:id',
  requireRole('admin', 'configuration_manager'),
  validateBody(updateCIClassSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const classId = req.params.id;

      const existing = await client.query('SELECT * FROM ci_classes WHERE id = $1', [classId]);
      if (existing.rows.length === 0) {
        throw NotFound('CI class not found');
      }

      const { display_name, description, parent_class, attributes, icon, is_active } = req.body;
      const setClauses: string[] = [];
      const params: unknown[] = [];
      let idx = 0;

      if (display_name !== undefined) { idx++; setClauses.push(`display_name = $${idx}`); params.push(display_name); }
      if (description !== undefined) { idx++; setClauses.push(`description = $${idx}`); params.push(description || null); }
      if (parent_class !== undefined) { idx++; setClauses.push(`parent_class = $${idx}`); params.push(parent_class || null); }
      if (attributes !== undefined) { idx++; setClauses.push(`attributes = $${idx}`); params.push(JSON.stringify(attributes)); }
      if (icon !== undefined) { idx++; setClauses.push(`icon = $${idx}`); params.push(icon); }
      if (is_active !== undefined) { idx++; setClauses.push(`is_active = $${idx}`); params.push(Boolean(is_active)); }

      if (setClauses.length === 0) {
        res.json(existing.rows[0]);
        return;
      }

      setClauses.push('updated_at = now()');
      idx++;
      params.push(classId);

      const result = await client.query(
        `UPDATE ci_classes SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
        params,
      );

      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /api/cmdb/classes/:id ───
router.delete(
  '/classes/:id',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const classId = req.params.id;

      const ciCount = await client.query(
        'SELECT count(*) FROM configuration_items WHERE class_id = $1',
        [classId],
      );
      if (parseInt(ciCount.rows[0].count, 10) > 0) {
        throw Conflict('Cannot delete a class that has existing configuration items');
      }

      await client.query('DELETE FROM ci_classes WHERE id = $1', [classId]);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ════════════════════════════════════════
// CONFIGURATION ITEMS
// ════════════════════════════════════════

// ─── GET /api/cmdb/items ───
router.get(
  '/items',
  validateQuery(paginationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { page, limit } = req.query as any;
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 0;

      // Non-fulfiller users can only see CIs managed by them,
      // unless context=picker (used by form reference pickers in catalog)
      const isFulfiller = isFulfillerRole(req);
      const isPicker = req.query.context === 'picker';
      if (!isFulfiller && !isPicker) {
        idx++;
        conditions.push(`ci.managed_by = $${idx}`);
        params.push(req.user!.id);
      }

      if (req.query.class_id) {
        idx++;
        conditions.push(`ci.class_id = $${idx}`);
        params.push(req.query.class_id);
      }
      if (req.query.class) {
        idx++;
        conditions.push(`cc.name = $${idx}`);
        params.push(req.query.class);
      }
      if (req.query.managed_by) {
        idx++;
        const mbVal = req.query.managed_by === '$current_user' ? req.user!.id : req.query.managed_by;
        conditions.push(`ci.managed_by = $${idx}`);
        params.push(mbVal);
      }
      if (req.query.status) {
        idx++;
        conditions.push(`ci.status = $${idx}`);
        params.push(req.query.status);
      }
      if (req.query.environment) {
        idx++;
        conditions.push(`ci.environment = $${idx}`);
        params.push(req.query.environment);
      }
      if (req.query.search) {
        idx++;
        conditions.push(`(ci.name ILIKE $${idx} OR ci.display_name ILIKE $${idx})`);
        params.push(`%${req.query.search}%`);
      }

      // Per-column "starts with" filters (cf.column=value)
      const cfMap: Record<string, string> = {
        name: 'ci.name', display_name: 'ci.display_name',
        status: 'ci.status::text', environment: 'ci.environment',
        class_display_name: 'cc.display_name',
        managed_by_name: 'u.display_name',
        assigned_to_name: 'ua.display_name',
        supported_by_name: 'ag.name',
        location: 'ci.location',
      };
      let needsExtraJoins = false;
      for (const [qKey, qVal] of Object.entries(req.query)) {
        if (typeof qKey === 'string' && qKey.startsWith('cf.') && typeof qVal === 'string' && qVal) {
          const col = cfMap[qKey.slice(3)];
          if (col) {
            idx++;
            conditions.push(`${col} ILIKE $${idx}`);
            params.push(`${qVal}%`);
            if (col.startsWith('cc.') || col.startsWith('u.') || col.startsWith('ua.') || col.startsWith('ag.')) needsExtraJoins = true;
          }
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const needsClassJoin = !!req.query.class || needsExtraJoins;
      const countFrom = needsClassJoin
        ? `configuration_items ci JOIN ci_classes cc ON cc.id = ci.class_id
           LEFT JOIN users u ON u.id = ci.managed_by LEFT JOIN users ua ON ua.id = ci.assigned_to
           LEFT JOIN assignment_groups ag ON ag.id = ci.supported_by`
        : 'configuration_items ci';
      const countResult = await client.query(
        `SELECT count(*) FROM ${countFrom} ${whereClause}`,
        params,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      // Sorting
      const allowedSortCols: Record<string, string> = {
        name: 'ci.name',
        display_name: 'ci.display_name',
        status: 'ci.status',
        environment: 'ci.environment',
        class_display_name: 'cc.display_name',
        managed_by_name: 'u.display_name',
        assigned_to_name: 'ua.display_name',
        supported_by_name: 'ag.name',
        location: 'ci.location',
        created_at: 'ci.created_at',
        updated_at: 'ci.updated_at',
      };
      const sortCol = allowedSortCols[req.query.sort_by as string];
      const sortDir = req.query.sort_dir === 'desc' ? 'DESC' : 'ASC';
      const orderClause = sortCol
        ? `ORDER BY ${sortCol} ${sortDir}`
        : 'ORDER BY ci.name';

      idx++;
      params.push(limit);
      idx++;
      params.push(offset);

      const result = await client.query(
        `SELECT ci.*, cc.display_name AS class_display_name, cc.icon AS class_icon,
                u.display_name AS managed_by_name,
                ua.display_name AS assigned_to_name,
                ag.name AS supported_by_name
         FROM configuration_items ci
         JOIN ci_classes cc ON cc.id = ci.class_id
         LEFT JOIN users u ON u.id = ci.managed_by
         LEFT JOIN users ua ON ua.id = ci.assigned_to
         LEFT JOIN assignment_groups ag ON ag.id = ci.supported_by
         ${whereClause}
         ${orderClause}
         LIMIT $${idx - 1} OFFSET $${idx}`,
        params,
      );

      res.json({
        items: result.rows,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/cmdb/items/nav ─── (prev/next navigation)
router.get('/items/nav', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const currentId = req.query.current as string;
    if (!currentId) {
      res.json({ prev_id: null, next_id: null });
      return;
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 0;

    const isFulfiller = isFulfillerRole(req);
    if (!isFulfiller) {
      idx++;
      conditions.push(`ci.managed_by = $${idx}`);
      params.push(req.user!.id);
    }

    if (req.query.class_id) {
      idx++;
      conditions.push(`ci.class_id = $${idx}`);
      params.push(req.query.class_id);
    }
    if (req.query.status) {
      idx++;
      conditions.push(`ci.status = $${idx}`);
      params.push(req.query.status);
    }
    if (req.query.environment) {
      idx++;
      conditions.push(`ci.environment = $${idx}`);
      params.push(req.query.environment);
    }
    if (req.query.search) {
      idx++;
      conditions.push(`(ci.name ILIKE $${idx} OR ci.display_name ILIKE $${idx})`);
      params.push(`%${req.query.search}%`);
    }

    const cfMap: Record<string, string> = {
      name: 'ci.name', display_name: 'ci.display_name',
      status: 'ci.status::text', environment: 'ci.environment',
      class_display_name: 'cc.display_name',
      managed_by_name: 'u.display_name',
      assigned_to_name: 'ua.display_name',
      supported_by_name: 'ag.name',
      location: 'ci.location',
    };
    for (const [qKey, qVal] of Object.entries(req.query)) {
      if (typeof qKey === 'string' && qKey.startsWith('cf.') && typeof qVal === 'string' && qVal) {
        const col = cfMap[qKey.slice(3)];
        if (col) {
          idx++;
          conditions.push(`${col} ILIKE $${idx}`);
          params.push(`${qVal}%`);
        }
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const allowedSortCols: Record<string, string> = {
      name: 'ci.name', display_name: 'ci.display_name',
      status: 'ci.status', environment: 'ci.environment',
      class_display_name: 'cc.display_name',
      managed_by_name: 'u.display_name',
      assigned_to_name: 'ua.display_name',
      supported_by_name: 'ag.name',
      location: 'ci.location',
      created_at: 'ci.created_at', updated_at: 'ci.updated_at',
    };
    const sortCol = allowedSortCols[req.query.sort_by as string];
    const sortDir = req.query.sort_dir === 'desc' ? 'DESC' : 'ASC';
    const orderClause = sortCol
      ? `ORDER BY ${sortCol} ${sortDir}`
      : 'ORDER BY ci.name';

    const result = await client.query(
      `SELECT ci.id
       FROM configuration_items ci
       JOIN ci_classes cc ON cc.id = ci.class_id
       LEFT JOIN users u ON u.id = ci.managed_by
       LEFT JOIN users ua ON ua.id = ci.assigned_to
       LEFT JOIN assignment_groups ag ON ag.id = ci.supported_by
       ${whereClause}
       ${orderClause}`,
      params,
    );

    const ids: string[] = result.rows.map((r: { id: string }) => r.id);
    const currentIndex = ids.indexOf(currentId);

    res.json({
      prev_id: currentIndex > 0 ? ids[currentIndex - 1] : null,
      next_id: currentIndex >= 0 && currentIndex < ids.length - 1 ? ids[currentIndex + 1] : null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/cmdb/items ───
router.post(
  '/items',
  requireRole('admin', 'fulfiller', 'configuration_manager'),
  validateBody(createCISchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const {
        class_id, name, display_name, status, environment,
        attributes, managed_by, assigned_to, supported_by, location, notes,
      } = req.body;

      const result = await client.query(
        `INSERT INTO configuration_items (
          tenant_id, class_id, name, display_name, status, environment,
          attributes, managed_by, assigned_to, supported_by, location, notes
        ) VALUES (
          current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        ) RETURNING *`,
        [
          class_id, name, display_name || name, status, environment,
          JSON.stringify(attributes), managed_by || null, assigned_to || null,
          supported_by || null, location || null, notes || null,
        ],
      );

      // Record creation in history
      await client.query(
        `INSERT INTO ci_history (tenant_id, ci_id, changed_by, change_type, new_value)
         VALUES (current_tenant_id(), $1, $2, 'create', $3)`,
        [result.rows[0].id, req.user!.id, JSON.stringify(result.rows[0])],
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/cmdb/items/:id ───
router.get('/items/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(
      `SELECT ci.*, cc.display_name AS class_display_name, cc.icon AS class_icon,
              cc.attributes AS class_attributes, cc.name AS class_name,
              u.display_name AS managed_by_name,
              ua.display_name AS assigned_to_name,
              ag.name AS supported_by_name
       FROM configuration_items ci
       JOIN ci_classes cc ON cc.id = ci.class_id
       LEFT JOIN users u ON u.id = ci.managed_by
       LEFT JOIN users ua ON ua.id = ci.assigned_to
       LEFT JOIN assignment_groups ag ON ag.id = ci.supported_by
       WHERE ci.id = $1`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      throw NotFound('Configuration item not found');
    }

    const ci = result.rows[0];
    const hasAccess = hasConfigurationRole(req);
    if (!hasAccess && ci.managed_by !== req.user!.id && ci.assigned_to !== req.user!.id) {
      res.status(403).json({ error: 'Insufficient permissions' }); return;
    }

    // Get relationships
    const relsOut = await client.query(
      `SELECT r.*, ci.name AS target_name, ci.display_name AS target_display_name
       FROM ci_relationships r
       JOIN configuration_items ci ON ci.id = r.target_ci_id
       WHERE r.source_ci_id = $1`,
      [req.params.id],
    );

    const relsIn = await client.query(
      `SELECT r.*, ci.name AS source_name, ci.display_name AS source_display_name
       FROM ci_relationships r
       JOIN configuration_items ci ON ci.id = r.source_ci_id
       WHERE r.target_ci_id = $1`,
      [req.params.id],
    );

    res.json({
      ...result.rows[0],
      relationships: {
        outgoing: relsOut.rows,
        incoming: relsIn.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/cmdb/items/:id ───
router.patch(
  '/items/:id',
  requireRole('admin', 'fulfiller', 'configuration_manager'),
  validateBody(updateCISchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const ciId = req.params.id;

      const existing = await client.query('SELECT * FROM configuration_items WHERE id = $1', [ciId]);
      if (existing.rows.length === 0) {
        throw NotFound('Configuration item not found');
      }

      const current = existing.rows[0];
      const updates = { ...req.body };

      if (updates.attributes) {
        updates.attributes = JSON.stringify(updates.attributes);
      }

      const setClauses: string[] = [];
      const params: unknown[] = [];
      let idx = 0;

      for (const [key, value] of Object.entries(updates)) {
        idx++;
        setClauses.push(`${key} = $${idx}`);
        params.push(value);
      }

      if (setClauses.length === 0) {
        res.json(current);
        return;
      }

      idx++;
      params.push(ciId);

      const result = await client.query(
        `UPDATE configuration_items SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
        params,
      );

      // Record changes in history
      for (const [key, value] of Object.entries(req.body)) {
        const oldValue = (current as any)[key];
        if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
          await client.query(
            `INSERT INTO ci_history (tenant_id, ci_id, changed_by, change_type, field_name, old_value, new_value)
             VALUES (current_tenant_id(), $1, $2, 'update', $3, $4, $5)`,
            [ciId, req.user!.id, key, JSON.stringify(oldValue), JSON.stringify(value)],
          );
        }
      }

      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/cmdb/items/:id/history ───
router.get('/items/:id/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(
      `SELECT h.*, u.display_name AS changed_by_name
       FROM ci_history h
       JOIN users u ON u.id = h.changed_by
       WHERE h.ci_id = $1
       ORDER BY h.created_at DESC`,
      [req.params.id],
    );

    res.json({ history: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/cmdb/items/:id/impact ───
router.get('/items/:id/impact', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const depth = parseInt((req.query.depth as string) || '5', 10);

    const result = await client.query(
      'SELECT * FROM cmdb_impact_analysis($1, $2)',
      [req.params.id, depth],
    );

    res.json({
      source_ci_id: req.params.id,
      depth,
      impacted_items: result.rows,
      total: result.rows.length,
    });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════
// RELATIONSHIPS
// ════════════════════════════════════════

// ─── GET /api/cmdb/relationships ───
router.get('/relationships', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(
      `SELECT r.*,
              s.name AS source_name, s.display_name AS source_display_name,
              t.name AS target_name, t.display_name AS target_display_name
       FROM ci_relationships r
       JOIN configuration_items s ON s.id = r.source_ci_id
       JOIN configuration_items t ON t.id = r.target_ci_id
       ORDER BY r.created_at DESC`,
    );

    res.json({ relationships: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/cmdb/relationships ───
router.post(
  '/relationships',
  requireRole('admin', 'fulfiller', 'configuration_manager'),
  validateBody(createCIRelationshipSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { source_ci_id, target_ci_id, relationship_type, notes } = req.body;

      // Prevent self-referencing
      if (source_ci_id === target_ci_id) {
        throw Conflict('A CI cannot have a relationship with itself');
      }

      const result = await client.query(
        `INSERT INTO ci_relationships (
          tenant_id, source_ci_id, target_ci_id, relationship_type, notes
        ) VALUES (
          current_tenant_id(), $1, $2, $3, $4
        ) RETURNING *`,
        [source_ci_id, target_ci_id, relationship_type, notes || null],
      );

      const rel = result.rows[0];
      const targetName = (await client.query('SELECT name FROM configuration_items WHERE id = $1', [target_ci_id])).rows[0]?.name || target_ci_id;
      const sourceName = (await client.query('SELECT name FROM configuration_items WHERE id = $1', [source_ci_id])).rows[0]?.name || source_ci_id;

      await client.query(
        `INSERT INTO ci_history (tenant_id, ci_id, changed_by, change_type, field_name, new_value)
         VALUES (current_tenant_id(), $1, $2, 'update', 'relationship_added', $3)`,
        [source_ci_id, req.user!.id, `${relationship_type} → ${targetName}`],
      );
      await client.query(
        `INSERT INTO ci_history (tenant_id, ci_id, changed_by, change_type, field_name, new_value)
         VALUES (current_tenant_id(), $1, $2, 'update', 'relationship_added', $3)`,
        [target_ci_id, req.user!.id, `${sourceName} → ${relationship_type}`],
      );

      res.status(201).json(rel);
    } catch (err) {
      // Handle unique constraint violation
      if ((err as any).code === '23505') {
        next(Conflict('This relationship already exists'));
        return;
      }
      next(err);
    }
  },
);

// ─── DELETE /api/cmdb/relationships/:id ───
router.delete('/relationships/:id', requireRole('admin', 'fulfiller', 'configuration_manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(
      'DELETE FROM ci_relationships WHERE id = $1 RETURNING *',
      [req.params.id],
    );

    if (result.rows.length === 0) {
      throw NotFound('Relationship not found');
    }

    const rel = result.rows[0];
    const targetName = (await client.query('SELECT name FROM configuration_items WHERE id = $1', [rel.target_ci_id])).rows[0]?.name || rel.target_ci_id;
    const sourceName = (await client.query('SELECT name FROM configuration_items WHERE id = $1', [rel.source_ci_id])).rows[0]?.name || rel.source_ci_id;

    await client.query(
      `INSERT INTO ci_history (tenant_id, ci_id, changed_by, change_type, field_name, old_value)
       VALUES (current_tenant_id(), $1, $2, 'update', 'relationship_removed', $3)`,
      [rel.source_ci_id, req.user!.id, `${rel.relationship_type} → ${targetName}`],
    );
    await client.query(
      `INSERT INTO ci_history (tenant_id, ci_id, changed_by, change_type, field_name, old_value)
       VALUES (current_tenant_id(), $1, $2, 'update', 'relationship_removed', $3)`,
      [rel.target_ci_id, req.user!.id, `${sourceName} → ${rel.relationship_type}`],
    );

    res.json({ deleted: true, relationship: rel });
  } catch (err) {
    next(err);
  }
});

export default router;
