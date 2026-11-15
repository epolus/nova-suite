/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Admin: Incident classification and custom field definitions ───

import { Router, Request, Response, NextFunction } from 'express';
import { getRequestClient } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { countCategoryReferences, countResolutionCodeReferences } from '../../domain/incident-classification';
import {
  countFieldValues,
  CUSTOM_FIELD_REQUIRED_ON,
  CUSTOM_FIELD_TYPES,
  isCustomFieldEntityType,
  isCustomFieldType,
  listFieldDefinitions,
  listFieldOptions,
} from '../../domain/custom-fields';

const router = Router();

// ════════════════════════════════════════════
// INCIDENT CLASSIFICATION
// ════════════════════════════════════════════

router.get('/incident-categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT c.id, c.name, c.description, c.parent_id, p.name AS parent_name,
              c.is_active, c.created_at, c.updated_at
       FROM incident_categories c
       LEFT JOIN incident_categories p ON p.id = c.parent_id
       WHERE c.tenant_id = current_tenant_id()
       ORDER BY COALESCE(p.name, c.name), CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END, c.name`,
    );
    res.json({ categories: rows.rows });
  } catch (err) { next(err); }
});

router.post('/incident-categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const { name, description, parent_id, is_active } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new AppError(400, 'name is required');
    }
    const parentId = typeof parent_id === 'string' && parent_id.trim() ? parent_id.trim() : null;
    if (parentId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parentId)) {
        throw new AppError(400, 'parent_id must be a valid category id');
      }
      const parent = await client.query(
        `SELECT id FROM incident_categories WHERE id = $1 AND tenant_id = current_tenant_id()`,
        [parentId],
      );
      if (parent.rows.length === 0) throw new AppError(400, 'parent_id not found');
    }
    const row = await client.query(
      `INSERT INTO incident_categories (tenant_id, name, description, parent_id, is_active)
       VALUES (current_tenant_id(), $1, $2, $3, COALESCE($4, true))
       RETURNING id`,
      [name.trim(), description || null, parentId, is_active],
    );
    res.status(201).json({ id: row.rows[0].id });
  } catch (err) { next(err); }
});

router.patch('/incident-categories/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = String(req.params.id);
    const { name, description, parent_id, is_active } = req.body || {};
    let nextParentId: string | null | undefined = undefined;
    if (parent_id !== undefined) {
      nextParentId = typeof parent_id === 'string' && parent_id.trim() ? parent_id.trim() : null;
      if (nextParentId === id) throw new AppError(400, 'Category cannot be its own parent');
      if (nextParentId) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nextParentId)) {
          throw new AppError(400, 'parent_id must be a valid category id');
        }
        const parent = await client.query(
          `SELECT id FROM incident_categories WHERE id = $1 AND tenant_id = current_tenant_id()`,
          [nextParentId],
        );
        if (parent.rows.length === 0) throw new AppError(400, 'parent_id not found');
      }
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !String(name).trim()) {
        throw new AppError(400, 'name is required');
      }
      sets.push(`name = $${i++}`);
      vals.push(String(name).trim());
    }
    if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description || null); }
    if (nextParentId !== undefined) { sets.push(`parent_id = $${i++}`); vals.push(nextParentId); }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }
    if (sets.length === 0) return void res.json({ success: true });
    vals.push(id);
    const result = await client.query(
      `UPDATE incident_categories
       SET ${sets.join(', ')}
       WHERE id = $${i} AND tenant_id = current_tenant_id()
       RETURNING id`,
      vals,
    );
    if (result.rows.length === 0) throw new AppError(404, 'Category not found');
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/incident-categories/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = String(req.params.id);
    const refs = await countCategoryReferences(client, id);
    if (refs > 0) {
      throw new AppError(409, 'Category is still referenced; set is_active to false instead of deleting');
    }
    const result = await client.query(
      `DELETE FROM incident_categories WHERE id = $1 AND tenant_id = current_tenant_id() RETURNING id`,
      [id],
    );
    if (result.rows.length === 0) throw new AppError(404, 'Category not found');
    res.json({ success: true });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === '23503') {
      next(new AppError(409, 'Category is still referenced; set is_active to false instead of deleting'));
      return;
    }
    next(err);
  }
});

router.get('/incident-resolution-codes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT id, code, label, is_active, created_at, updated_at
       FROM incident_resolution_codes
       WHERE tenant_id = current_tenant_id()
       ORDER BY code`,
    );
    res.json({ resolution_codes: rows.rows });
  } catch (err) { next(err); }
});

router.post('/incident-resolution-codes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const { code, label, is_active } = req.body || {};
    if (!code || typeof code !== 'string' || !code.trim()) {
      throw new AppError(400, 'code is required');
    }
    if (!label || typeof label !== 'string' || !label.trim()) {
      throw new AppError(400, 'label is required');
    }
    const row = await client.query(
      `INSERT INTO incident_resolution_codes (tenant_id, code, label, is_active)
       VALUES (current_tenant_id(), $1, $2, COALESCE($3, true))
       RETURNING id`,
      [code.trim(), label.trim(), is_active],
    );
    res.status(201).json({ id: row.rows[0].id });
  } catch (err) { next(err); }
});

router.patch('/incident-resolution-codes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = String(req.params.id);
    const { code, label, is_active } = req.body || {};
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (code !== undefined) {
      if (!code || typeof code !== 'string' || !String(code).trim()) {
        throw new AppError(400, 'code is required');
      }
      sets.push(`code = $${i++}`);
      vals.push(String(code).trim());
    }
    if (label !== undefined) {
      if (!label || typeof label !== 'string' || !String(label).trim()) {
        throw new AppError(400, 'label is required');
      }
      sets.push(`label = $${i++}`);
      vals.push(String(label).trim());
    }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }
    if (sets.length === 0) return void res.json({ success: true });
    vals.push(id);
    const result = await client.query(
      `UPDATE incident_resolution_codes
       SET ${sets.join(', ')}
       WHERE id = $${i} AND tenant_id = current_tenant_id()
       RETURNING id`,
      vals,
    );
    if (result.rows.length === 0) throw new AppError(404, 'Resolution code not found');
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/incident-resolution-codes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = String(req.params.id);
    const refs = await countResolutionCodeReferences(client, id);
    if (refs > 0) {
      throw new AppError(409, 'Resolution code is still referenced; set is_active to false instead of deleting');
    }
    const result = await client.query(
      `DELETE FROM incident_resolution_codes WHERE id = $1 AND tenant_id = current_tenant_id() RETURNING id`,
      [id],
    );
    if (result.rows.length === 0) throw new AppError(404, 'Resolution code not found');
    res.json({ success: true });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === '23503') {
      next(new AppError(409, 'Resolution code is still referenced; set is_active to false instead of deleting'));
      return;
    }
    next(err);
  }
});

// ════════════════════════════════════════════
// CUSTOM FIELD DEFINITIONS
// ════════════════════════════════════════════

router.get('/field-definitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const entityType = String((req.query as Record<string, unknown>).entity_type ?? '');
    if (!isCustomFieldEntityType(entityType)) {
      throw new AppError(400, 'entity_type query param is required (incident|change|asset)');
    }
    const definitions = await listFieldDefinitions(client, entityType, { activeOnly: false });
    const options = await listFieldOptions(client, definitions.map((d) => d.id), { activeOnly: false });
    const optionsByField = new Map<string, typeof options>();
    for (const opt of options) {
      const list = optionsByField.get(opt.field_id) ?? [];
      list.push(opt);
      optionsByField.set(opt.field_id, list);
    }
    res.json({
      definitions: definitions.map((d) => ({
        ...d,
        options: optionsByField.get(d.id) ?? [],
      })),
    });
  } catch (err) { next(err); }
});

router.post('/field-definitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const {
      entity_type, field_key, label, field_type, config, required_on, sort_order, is_active, options,
    } = req.body || {};
    if (!isCustomFieldEntityType(entity_type)) {
      throw new AppError(400, 'entity_type must be incident, change, or asset');
    }
    if (!field_key || typeof field_key !== 'string' || !/^[a-z][a-z0-9_]*$/.test(field_key) || field_key.length > 64) {
      throw new AppError(400, 'field_key must be snake_case starting with a letter');
    }
    if (!label || typeof label !== 'string' || !label.trim()) {
      throw new AppError(400, 'label is required');
    }
    if (!isCustomFieldType(field_type)) {
      throw new AppError(400, `field_type must be one of: ${CUSTOM_FIELD_TYPES.join(', ')}`);
    }
    const requiredOn = required_on == null || required_on === '' ? '' : String(required_on);
    if (!(CUSTOM_FIELD_REQUIRED_ON as readonly string[]).includes(requiredOn)) {
      throw new AppError(400, 'required_on must be empty, create, or resolve');
    }
    if (requiredOn === 'resolve' && entity_type !== 'incident') {
      throw new AppError(400, 'required_on=resolve is only valid for incidents');
    }
    const row = await client.query(
      `INSERT INTO field_definitions (
         tenant_id, entity_type, field_key, label, field_type, config, required_on, sort_order, is_active
       ) VALUES (
         current_tenant_id(), $1, $2, $3, $4, COALESCE($5::jsonb, '{}'::jsonb), $6, COALESCE($7, 0), COALESCE($8, true)
       ) RETURNING id`,
      [
        entity_type,
        field_key.trim(),
        label.trim(),
        field_type,
        JSON.stringify(config && typeof config === 'object' ? config : {}),
        requiredOn,
        sort_order ?? 0,
        is_active,
      ],
    );
    const fieldId = row.rows[0].id as string;
    if (Array.isArray(options)) {
      for (let i = 0; i < options.length; i++) {
        const opt = options[i] || {};
        const value = String(opt.value ?? opt.label ?? '').trim();
        const optLabel = String(opt.label ?? opt.value ?? '').trim();
        if (!value || !optLabel) continue;
        await client.query(
          `INSERT INTO field_options (tenant_id, field_id, value, label, sort_order, is_active)
           VALUES (current_tenant_id(), $1, $2, $3, $4, COALESCE($5, true))`,
          [fieldId, value, optLabel, opt.sort_order ?? i, opt.is_active],
        );
      }
    }
    res.status(201).json({ id: fieldId });
  } catch (err) { next(err); }
});

router.patch('/field-definitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = String(req.params.id);
    const existing = await client.query(
      `SELECT id, field_key, field_type FROM field_definitions
       WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [id],
    );
    if (existing.rows.length === 0) throw new AppError(404, 'Field definition not found');
    const current = existing.rows[0] as { id: string; field_key: string; field_type: string };

    const {
      label, field_type, config, required_on, sort_order, is_active, options,
    } = req.body || {};

    if (req.body?.field_key !== undefined && req.body.field_key !== current.field_key) {
      throw new AppError(400, 'field_key is immutable');
    }

    if (field_type !== undefined && field_type !== current.field_type) {
      if (!isCustomFieldType(field_type)) {
        throw new AppError(400, `field_type must be one of: ${CUSTOM_FIELD_TYPES.join(', ')}`);
      }
      const valueCount = await countFieldValues(client, id);
      if (valueCount > 0) {
        throw new AppError(409, 'Cannot change field_type once values exist');
      }
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (label !== undefined) {
      if (!label || typeof label !== 'string' || !String(label).trim()) {
        throw new AppError(400, 'label is required');
      }
      sets.push(`label = $${i++}`);
      vals.push(String(label).trim());
    }
    if (field_type !== undefined) {
      sets.push(`field_type = $${i++}`);
      vals.push(field_type);
    }
    if (config !== undefined) {
      sets.push(`config = $${i++}::jsonb`);
      vals.push(JSON.stringify(config && typeof config === 'object' ? config : {}));
    }
    if (required_on !== undefined) {
      const requiredOn = required_on == null || required_on === '' ? '' : String(required_on);
      if (!(CUSTOM_FIELD_REQUIRED_ON as readonly string[]).includes(requiredOn)) {
        throw new AppError(400, 'required_on must be empty, create, or resolve');
      }
      sets.push(`required_on = $${i++}`);
      vals.push(requiredOn);
    }
    if (sort_order !== undefined) {
      sets.push(`sort_order = $${i++}`);
      vals.push(Number(sort_order) || 0);
    }
    if (is_active !== undefined) {
      sets.push(`is_active = $${i++}`);
      vals.push(Boolean(is_active));
    }
    if (sets.length > 0) {
      vals.push(id);
      await client.query(
        `UPDATE field_definitions SET ${sets.join(', ')}
         WHERE id = $${i} AND tenant_id = current_tenant_id()`,
        vals,
      );
    }

    if (Array.isArray(options)) {
      await client.query(
        `DELETE FROM field_options WHERE field_id = $1 AND tenant_id = current_tenant_id()`,
        [id],
      );
      for (let idx = 0; idx < options.length; idx++) {
        const opt = options[idx] || {};
        const value = String(opt.value ?? opt.label ?? '').trim();
        const optLabel = String(opt.label ?? opt.value ?? '').trim();
        if (!value || !optLabel) continue;
        await client.query(
          `INSERT INTO field_options (tenant_id, field_id, value, label, sort_order, is_active)
           VALUES (current_tenant_id(), $1, $2, $3, $4, COALESCE($5, true))`,
          [id, value, optLabel, opt.sort_order ?? idx, opt.is_active],
        );
      }
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/field-definitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const id = String(req.params.id);
    const valueCount = await countFieldValues(client, id);
    if (valueCount > 0) {
      throw new AppError(409, 'Field still has values; set is_active to false instead of deleting');
    }
    const result = await client.query(
      `DELETE FROM field_definitions WHERE id = $1 AND tenant_id = current_tenant_id() RETURNING id`,
      [id],
    );
    if (result.rows.length === 0) throw new AppError(404, 'Field definition not found');
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
