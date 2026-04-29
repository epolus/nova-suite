/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Service Catalog Routes ───
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { db } from '../../data/db';
import { authenticate, requireRole, getRequestClient, setTenantRLS, releaseTenantClient } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { createCategorySchema, createServiceItemSchema, updateServiceItemSchema } from '../../domain/schemas';
import { NotFound, BadRequest } from '../../middleware/errorHandler';
import { config } from '../../config';

const router = Router();

function requireAutomationSharedKey(req: Request, res: Response, next: NextFunction): void {
  const configured = config.catalogAutomation.sharedKey;
  if (!configured) {
    res.status(503).json({
      error: 'Catalog automation key is not configured',
      hint: 'Set CATALOG_AUTOMATION_SHARED_KEY on the API server and restart.',
    });
    return;
  }
  const provided = req.headers['x-automation-key'];
  const headerKey = typeof provided === 'string' ? provided.trim() : Array.isArray(provided) ? provided[0]?.trim() : '';
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const key = headerKey || bearer;
  if (!key || key !== configured) {
    res.status(401).json({ error: 'Invalid automation key' });
    return;
  }
  next();
}

// ─── POST /api/catalog/automation/add-support-group-member ───
// Helper endpoint for demo catalog automation state machines.
router.post(
  '/automation/add-support-group-member',
  requireAutomationSharedKey,
  async (req: Request, res: Response, next: NextFunction) => {
    let client: Awaited<ReturnType<typeof db.getClient>> | null = null;
    try {
      const userId = typeof req.body?.user_id === 'string' ? req.body.user_id.trim() : '';
      const groupIdRaw = typeof req.body?.group_id === 'string' ? req.body.group_id.trim() : '';
      const groupNameRaw = typeof req.body?.group_name === 'string' ? req.body.group_name.trim() : '';
      const requestId = typeof req.body?.request_id === 'string' ? req.body.request_id.trim() : '';
      if (!requestId) throw BadRequest('request_id is required');
      if (!userId) throw BadRequest('user_id is required');
      if (!groupIdRaw && !groupNameRaw) throw BadRequest('group_id or group_name is required');

      client = await db.getClient();
      const requestRes = await client.query(
        `SELECT tenant_id FROM requests WHERE id = $1`,
        [requestId],
      );
      if (requestRes.rows.length === 0) throw NotFound('Request not found');
      const tenantId = String(requestRes.rows[0].tenant_id);

      const userResult = await client.query(
        `SELECT id, display_name
         FROM users
         WHERE id = $1
           AND tenant_id = $2`,
        [userId, tenantId],
      );
      if (userResult.rows.length === 0) throw NotFound('User not found');

      const groupResult = groupIdRaw
        ? await client.query(
          `SELECT id, name, manager_id
           FROM assignment_groups
           WHERE id = $1
             AND tenant_id = $2`,
          [groupIdRaw, tenantId],
        )
        : await client.query(
          `SELECT id, name, manager_id
           FROM assignment_groups
           WHERE tenant_id = $1
             AND lower(name) = lower($2)
           ORDER BY name
           LIMIT 1`,
          [tenantId, groupNameRaw],
        );
      if (groupResult.rows.length === 0) throw NotFound('Assignment group not found');
      const group = groupResult.rows[0] as { id: string; name: string; manager_id: string | null };

      const insertResult = await client.query(
        `INSERT INTO assignment_group_members (tenant_id, group_id, user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, group_id, user_id) DO NOTHING
         RETURNING user_id`,
        [tenantId, group.id, userId],
      );
      const added = insertResult.rows.length > 0;

      res.json({
        success: true,
        added,
        group_id: group.id,
        group_name: group.name,
        group_manager_id: group.manager_id,
        user_id: userId,
      });
    } catch (err) {
      next(err);
    } finally {
      client?.release();
    }
  },
);

router.use(authenticate, setTenantRLS, releaseTenantClient);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxFileSize },
});

type AutomationTransition = { to: string; when?: string };
type AutomationState = {
  id: string;
  type: 'activity' | 'decision' | 'delay' | 'end';
  transitions?: AutomationTransition[];
  method?: string;
  url?: string;
  condition?: string;
  delaySeconds?: number;
  retryAttempts?: number;
  retryBackoffSec?: number;
  onError?: 'fail' | 'continue' | 'fallback';
  fallbackNodeId?: string;
};

function collectCredentialSlugsFromString(raw: string, out: Set<string>): void {
  const re = /\{\{\s*cred\.([A-Za-z0-9_]+)(?:\.[^}\s]+)?\s*\}\}/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(raw)) !== null) out.add(m[1]);
}

function collectCredentialSlugsFromAutomationConfig(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const cfg = raw as Record<string, unknown>;
  const states = Array.isArray(cfg.states) ? cfg.states : [];
  const out = new Set<string>();
  for (const s of states) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) continue;
    const state = s as Record<string, unknown>;
    for (const key of ['url', 'body', 'condition'] as const) {
      const val = state[key];
      if (typeof val === 'string') collectCredentialSlugsFromString(val, out);
    }
    const headers = state.headers;
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      for (const v of Object.values(headers as Record<string, unknown>)) {
        if (typeof v === 'string') collectCredentialSlugsFromString(v, out);
      }
    }
    for (const branchKey of ['onSuccess', 'onFailure'] as const) {
      const branch = state[branchKey];
      if (!branch || typeof branch !== 'object' || Array.isArray(branch)) continue;
      const merge = (branch as Record<string, unknown>).mergeFormData;
      if (merge && typeof merge === 'object' && !Array.isArray(merge)) {
        for (const v of Object.values(merge as Record<string, unknown>)) {
          if (typeof v === 'string') collectCredentialSlugsFromString(v, out);
        }
      }
    }
  }
  return [...out];
}

async function ensureCredentialSlugsExist(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  slugs: string[],
): Promise<void> {
  if (slugs.length === 0) return;
  const result = await client.query(
    `SELECT slug
     FROM tenant_credentials
     WHERE tenant_id = current_tenant_id()
       AND slug = ANY($1::text[])`,
    [slugs],
  );
  const existing = new Set(result.rows.map((r) => String(r.slug)));
  const missing = slugs.filter((slug) => !existing.has(slug));
  if (missing.length > 0) {
    throw BadRequest(`Unknown credential slug(s) in automation_config: ${missing.join(', ')}`);
  }
}

function validateAutomationConfig(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return ['automation_config must be a JSON object'];
  }
  const cfg = raw as Record<string, unknown>;
  if (cfg.kind !== 'state_machine') {
    errors.push('automation_config.kind must be "state_machine"');
  }
  if (typeof cfg.startAt !== 'string' || !cfg.startAt.trim()) {
    errors.push('automation_config.startAt is required');
  }
  if (!Array.isArray(cfg.states) || cfg.states.length === 0) {
    errors.push('automation_config.states must be a non-empty array');
    return errors;
  }
  if (cfg.states.length > 80) {
    errors.push('automation_config.states cannot exceed 80 states');
  }

  const states = cfg.states as unknown[];
  const byId = new Map<string, AutomationState>();
  for (const s of states) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      errors.push('Each automation state must be an object');
      continue;
    }
    const st = s as AutomationState;
    if (typeof st.id !== 'string' || !st.id.trim()) {
      errors.push('Each automation state requires a non-empty id');
      continue;
    }
    if (byId.has(st.id)) {
      errors.push(`Duplicate automation state id: ${st.id}`);
      continue;
    }
    byId.set(st.id, st);
  }

  const startAt = cfg.startAt as string;
  if (startAt && !byId.has(startAt)) {
    errors.push('automation_config.startAt must reference a state id');
  }

  for (const st of byId.values()) {
    if (!['activity', 'decision', 'delay', 'end'].includes(st.type)) {
      errors.push(`State "${st.id}" has invalid type`);
      continue;
    }
    const transitions = Array.isArray(st.transitions) ? st.transitions : [];
    if (st.type !== 'end' && transitions.length === 0) {
      errors.push(`State "${st.id}" requires at least one transition`);
    }
    if (st.type === 'activity') {
      if (typeof st.url !== 'string' || !st.url.trim()) errors.push(`Activity "${st.id}" requires url`);
      if (st.method !== undefined && typeof st.method !== 'string') errors.push(`Activity "${st.id}" method must be a string`);
      if (st.retryAttempts !== undefined && (!Number.isInteger(st.retryAttempts) || st.retryAttempts < 1 || st.retryAttempts > 10)) {
        errors.push(`Activity "${st.id}" retryAttempts must be an integer between 1 and 10`);
      }
      if (st.retryBackoffSec !== undefined && (typeof st.retryBackoffSec !== 'number' || st.retryBackoffSec < 0 || st.retryBackoffSec > 300)) {
        errors.push(`Activity "${st.id}" retryBackoffSec must be between 0 and 300`);
      }
      if (st.onError === 'fallback' && (!st.fallbackNodeId || typeof st.fallbackNodeId !== 'string')) {
        errors.push(`Activity "${st.id}" onError=fallback requires fallbackNodeId`);
      }
    } else if (st.type === 'decision') {
      if (typeof st.condition !== 'string' || !st.condition.trim()) {
        errors.push(`Decision "${st.id}" requires condition`);
      }
      const labels = new Set(transitions.map((t) => String((t as AutomationTransition).when || '')));
      if (!labels.has('true') || !labels.has('false')) {
        errors.push(`Decision "${st.id}" transitions must include when=true and when=false`);
      }
    } else if (st.type === 'delay') {
      if (typeof st.delaySeconds !== 'number' || st.delaySeconds <= 0 || st.delaySeconds > 3600) {
        errors.push(`Delay "${st.id}" requires delaySeconds between 1 and 3600`);
      }
    } else if (st.type === 'end' && transitions.length > 0) {
      errors.push(`End state "${st.id}" cannot define transitions`);
    }

    for (const t of transitions) {
      const tr = t as AutomationTransition;
      if (!tr || typeof tr !== 'object' || typeof tr.to !== 'string' || !tr.to.trim()) {
        errors.push(`State "${st.id}" has an invalid transition`);
        continue;
      }
      if (!byId.has(tr.to)) {
        errors.push(`State "${st.id}" transition points to unknown state "${tr.to}"`);
      }
    }
    if (st.onError === 'fallback' && st.fallbackNodeId && !byId.has(st.fallbackNodeId)) {
      errors.push(`Activity "${st.id}" fallbackNodeId points to unknown state "${st.fallbackNodeId}"`);
    }
  }
  return errors;
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── GET /api/catalog/categories ───
router.get('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(
      'SELECT * FROM service_categories WHERE is_active = true ORDER BY sort_order, name',
    );
    res.json({ categories: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/catalog/categories ───
router.post(
  '/categories',
  requireRole('admin', 'catalog_designer'),
  validateBody(createCategorySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { name, description, icon, sort_order } = req.body;
      const result = await client.query(
        `INSERT INTO service_categories (tenant_id, name, description, icon, sort_order)
         VALUES (current_tenant_id(), $1, $2, $3, $4) RETURNING *`,
        [name, description || null, icon || 'folder', sort_order || 0],
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/catalog/items ───
router.get('/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const categoryId = req.query.category_id;
    const includeInactive = req.query.include_inactive === 'true';

    let sql = `
      SELECT si.*, sc.name AS category_name
      FROM service_items si
      JOIN service_categories sc ON sc.id = si.category_id
    `;
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (!includeInactive) {
      conditions.push('si.is_active = true');
    }
    if (categoryId) {
      params.push(categoryId);
      conditions.push(`si.category_id = $${params.length}`);
    }
    if (conditions.length) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY sc.sort_order, si.name';

    const result = await client.query(sql, params);
    res.json({ items: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/catalog/items/:id ───
router.get('/items/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(
      `SELECT si.*, sc.name AS category_name
       FROM service_items si
       JOIN service_categories sc ON sc.id = si.category_id
       WHERE si.id = $1`,
      [req.params.id],
    );
    if (result.rows.length === 0) throw NotFound('Service item not found');
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/catalog/items ───
router.post(
  '/items',
  requireRole('admin', 'catalog_designer'),
  validateBody(createServiceItemSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const {
        category_id, name, short_description, description,
        icon, price, custom_attributes, form_schema, approval_required, sla_hours,
      } = req.body;

      const result = await client.query(
        `INSERT INTO service_items (
          tenant_id, category_id, name, short_description, description,
          icon, price, custom_attributes, form_schema, approval_required, sla_hours
        ) VALUES (
          current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        ) RETURNING *`,
        [
          category_id, name, short_description || null, description || null,
          icon || 'box', price ?? null, JSON.stringify(custom_attributes || {}),
          JSON.stringify(form_schema), approval_required, sla_hours || 72,
        ],
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /api/catalog/items/:id ───
router.put(
  '/items/:id',
  requireRole('admin', 'catalog_designer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const {
        category_id, name, short_description, description,
        icon, price, custom_attributes, form_schema, approval_required, sla_hours, is_active,
      } = req.body;

      if (is_active === true) {
        const taskCount = await client.query(
          'SELECT count(*) FROM catalog_tasks WHERE service_item_id = $1 AND is_active = true',
          [req.params.id],
        );
        if (parseInt(taskCount.rows[0].count, 10) === 0) {
          throw BadRequest('Cannot activate a service item without at least one active Catalog Workflow Task');
        }
      }

      const result = await client.query(
        `UPDATE service_items SET
          category_id = COALESCE($1, category_id),
          name = COALESCE($2, name),
          short_description = $3,
          description = $4,
          icon = COALESCE($5, icon),
          price = $6,
          custom_attributes = COALESCE($7, custom_attributes),
          form_schema = COALESCE($8, form_schema),
          approval_required = COALESCE($9, approval_required),
          sla_hours = COALESCE($10, sla_hours),
          is_active = COALESCE($11, is_active),
          updated_at = now()
        WHERE id = $12
        RETURNING *`,
        [
          category_id || null, name || null,
          short_description ?? null, description ?? null,
          icon || null, price ?? null,
          custom_attributes ? JSON.stringify(custom_attributes) : null,
          form_schema ? JSON.stringify(form_schema) : null,
          approval_required ?? null, sla_hours ?? null, is_active ?? null,
          req.params.id,
        ],
      );
      if (result.rows.length === 0) throw NotFound('Service item not found');
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/catalog/items/:id/picture ───
router.post(
  '/items/:id/picture',
  requireRole('admin', 'catalog_designer'),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const client = getRequestClient(req);
      const file = req.file;
      if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }

      const ext = path.extname(file.originalname) || '.jpg';
      const storageKey = `catalog/${req.params.id}/${crypto.randomUUID()}${ext}`;
      const fullPath = path.join(config.uploads.dir, storageKey);

      ensureDir(path.dirname(fullPath));
      fs.writeFileSync(fullPath, file.buffer);

      // Remove old picture if exists
      const old = await client.query('SELECT picture_storage_key FROM service_items WHERE id = $1', [req.params.id]);
      if (old.rows[0]?.picture_storage_key) {
        try { fs.unlinkSync(path.join(config.uploads.dir, old.rows[0].picture_storage_key as string)); } catch { /* ignore */ }
      }

      const result = await client.query(
        'UPDATE service_items SET picture_storage_key = $1, updated_at = now() WHERE id = $2 RETURNING *',
        [storageKey, req.params.id],
      );
      if (result.rows.length === 0) throw NotFound('Service item not found');
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/catalog/items/:id/picture ───
router.get('/items/:id/picture', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const client = getRequestClient(req);
    const result = await client.query('SELECT picture_storage_key FROM service_items WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0 || !result.rows[0].picture_storage_key) {
      res.status(204).end(); return;
    }
    const fullPath = path.join(config.uploads.dir, result.rows[0].picture_storage_key as string);
    if (!fs.existsSync(fullPath)) { res.status(204).end(); return; }

    const ext = path.extname(fullPath).toLowerCase();
    const mimeMap: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/catalog/items/:id/picture ───
router.delete('/items/:id/picture', requireRole('admin', 'catalog_designer'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const client = getRequestClient(req);
      const old = await client.query('SELECT picture_storage_key FROM service_items WHERE id = $1', [req.params.id]);
      if (old.rows[0]?.picture_storage_key) {
        try { fs.unlinkSync(path.join(config.uploads.dir, old.rows[0].picture_storage_key as string)); } catch { /* ignore */ }
      }
      await client.query('UPDATE service_items SET picture_storage_key = NULL, updated_at = now() WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /api/catalog/items/:id ───
router.delete('/items/:id', requireRole('admin', 'catalog_designer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      await client.query('UPDATE service_items SET is_active = false, updated_at = now() WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/catalog/tasks ───
router.get('/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(
      `SELECT ct.*, si.name AS service_item_name, sc.name AS category_name,
              ag.name AS assigned_group_name,
              si.is_active AS service_item_is_active
       FROM catalog_tasks ct
       JOIN service_items si ON si.id = ct.service_item_id
       JOIN service_categories sc ON sc.id = si.category_id
       LEFT JOIN assignment_groups ag ON ag.id = ct.assigned_group_id
       ORDER BY ag.name NULLS LAST, si.name, ct.task_order, ct.created_at`,
    );
    res.json({ tasks: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/catalog/items/:id/tasks ───
router.get('/items/:id/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(
      `SELECT ct.*, ag.name AS assigned_group_name
       FROM catalog_tasks ct
       LEFT JOIN assignment_groups ag ON ag.id = ct.assigned_group_id
       WHERE ct.service_item_id = $1
       ORDER BY ct.task_order, ct.created_at`,
      [req.params.id],
    );
    res.json({ tasks: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/catalog/items/:id/tasks ───
router.post('/items/:id/tasks', requireRole('admin', 'catalog_designer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { name, description, instructions, task_type, task_order, assigned_group_id, sla_hours, automation_config } = req.body;
      if (!name || !task_type) { res.status(400).json({ error: 'name and task_type are required' }); return; }
      let automationJson: Record<string, unknown> = {};
      if (automation_config !== undefined && automation_config !== null) {
        if (typeof automation_config !== 'object' || Array.isArray(automation_config)) {
          res.status(400).json({ error: 'automation_config must be a JSON object' });
          return;
        }
        automationJson = automation_config as Record<string, unknown>;
      }
      if (task_type === 'automated') {
        const errors = validateAutomationConfig(automationJson);
        if (errors.length > 0) {
          res.status(400).json({ error: 'Invalid automation_config', details: errors });
          return;
        }
        const slugRefs = collectCredentialSlugsFromAutomationConfig(automationJson);
        await ensureCredentialSlugsExist(client, slugRefs);
      }

      const result = await client.query(
        `INSERT INTO catalog_tasks (
          tenant_id, service_item_id, name, description, instructions,
          task_type, task_order, assigned_group_id, sla_hours, automation_config
        ) VALUES (
          current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb
        ) RETURNING *`,
        [req.params.id, name, description || null, instructions || null, task_type, task_order || 1, assigned_group_id || null, sla_hours || null, JSON.stringify(automationJson)],
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /api/catalog/items/:id/tasks/:taskId ───
router.put('/items/:id/tasks/:taskId', requireRole('admin', 'catalog_designer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const { name, description, instructions, task_type, task_order, assigned_group_id, sla_hours, is_active, automation_config } = req.body;

      let automationSql = '';
      const params: unknown[] = [name, description ?? null, instructions ?? null, task_type, task_order, assigned_group_id || null, sla_hours || null, is_active, req.params.taskId, req.params.id];
      if (Object.prototype.hasOwnProperty.call(req.body, 'automation_config')) {
        if (automation_config !== undefined && automation_config !== null &&
            (typeof automation_config !== 'object' || Array.isArray(automation_config))) {
          res.status(400).json({ error: 'automation_config must be a JSON object' });
          return;
        }
        if (task_type === 'automated') {
          const errors = validateAutomationConfig(automation_config ?? {});
          if (errors.length > 0) {
            res.status(400).json({ error: 'Invalid automation_config', details: errors });
            return;
          }
          const slugRefs = collectCredentialSlugsFromAutomationConfig(automation_config ?? {});
          await ensureCredentialSlugsExist(client, slugRefs);
        }
        automationSql = ', automation_config = COALESCE($11::jsonb, \'{}\'::jsonb)';
        params.push(JSON.stringify(automation_config ?? {}));
      }

      const result = await client.query(
        `UPDATE catalog_tasks SET
          name = COALESCE($1, name), description = $2, instructions = $3,
          task_type = COALESCE($4, task_type), task_order = COALESCE($5, task_order),
          assigned_group_id = $6, sla_hours = $7, is_active = COALESCE($8, is_active)${automationSql}, updated_at = now()
        WHERE id = $9 AND service_item_id = $10 RETURNING *`,
        params,
      );
      if (result.rows.length === 0) throw NotFound('Task definition not found');
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /api/catalog/items/:id/tasks/:taskId ───
router.delete('/items/:id/tasks/:taskId', requireRole('admin', 'catalog_designer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      await client.query('DELETE FROM catalog_tasks WHERE id = $1 AND service_item_id = $2', [req.params.taskId, req.params.id]);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
