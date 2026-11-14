/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { AppError } from '../middleware/errorHandler';

export const CHECKLIST_ENTITY_TYPES = ['incident', 'change'] as const;
export type ChecklistEntityType = (typeof CHECKLIST_ENTITY_TYPES)[number];

export function isChecklistEntityType(value: string): value is ChecklistEntityType {
  return (CHECKLIST_ENTITY_TYPES as readonly string[]).includes(value);
}

function throwDuplicateTemplateName(err: unknown): never {
  const code = (err as { code?: string })?.code;
  if (code === '23505') {
    throw new AppError(
      409,
      'A checklist template with this name already exists for this record type',
      'CHECKLIST_TEMPLATE_EXISTS',
    );
  }
  throw err;
}

export type ChecklistTemplateItem = {
  id: string;
  label: string;
  sort_order: number;
  required: boolean;
};

export type ChecklistTemplate = {
  id: string;
  name: string;
  entity_type: ChecklistEntityType;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  items: ChecklistTemplateItem[];
};

export type ChecklistInstanceItem = {
  id: string;
  label: string;
  sort_order: number;
  required: boolean;
  is_done: boolean;
  done_by: string | null;
  done_by_name: string | null;
  done_at: string | null;
};

export type ChecklistInstance = {
  id: string;
  entity_type: ChecklistEntityType;
  entity_id: string;
  template_id: string | null;
  template_name: string;
  created_at: string;
  items: ChecklistInstanceItem[];
  open_required_count: number;
};

const ENTITY_TABLE: Record<ChecklistEntityType, string> = {
  incident: 'incidents',
  change: 'changes',
};

export async function assertChecklistEntityExists(
  client: PoolClient,
  entityType: ChecklistEntityType,
  entityId: string,
): Promise<void> {
  const table = ENTITY_TABLE[entityType];
  const r = await client.query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND tenant_id = current_tenant_id() LIMIT 1`,
    [entityId],
  );
  if (r.rowCount === 0) throw new AppError(404, `${entityType} not found`);
}

async function loadTemplateItems(
  client: PoolClient,
  templateId: string,
): Promise<ChecklistTemplateItem[]> {
  const r = await client.query(
    `SELECT id, label, sort_order, required
     FROM checklist_template_items
     WHERE template_id = $1
     ORDER BY sort_order ASC, label ASC`,
    [templateId],
  );
  return r.rows as ChecklistTemplateItem[];
}

export async function listChecklistTemplates(
  client: PoolClient,
  opts?: { entityType?: ChecklistEntityType; includeInactive?: boolean },
): Promise<ChecklistTemplate[]> {
  const r = await client.query(
    `SELECT id, name, entity_type, description, is_active, created_at, updated_at
     FROM checklist_templates
     WHERE ($1::text IS NULL OR entity_type = $1)
       AND ($2::boolean OR is_active = true)
     ORDER BY entity_type ASC, name ASC`,
    [opts?.entityType ?? null, opts?.includeInactive === true],
  );
  const templates: ChecklistTemplate[] = [];
  for (const row of r.rows) {
    templates.push({
      ...(row as Omit<ChecklistTemplate, 'items'>),
      items: await loadTemplateItems(client, String(row.id)),
    });
  }
  return templates;
}

export async function getChecklistTemplate(
  client: PoolClient,
  templateId: string,
): Promise<ChecklistTemplate | null> {
  const r = await client.query(
    `SELECT id, name, entity_type, description, is_active, created_at, updated_at
     FROM checklist_templates
     WHERE id = $1
     LIMIT 1`,
    [templateId],
  );
  if (!r.rows[0]) return null;
  return {
    ...(r.rows[0] as Omit<ChecklistTemplate, 'items'>),
    items: await loadTemplateItems(client, templateId),
  };
}

export async function createChecklistTemplate(
  client: PoolClient,
  input: {
    name: string;
    entityType: ChecklistEntityType;
    description?: string | null;
    isActive?: boolean;
    items: Array<{ label: string; sort_order?: number; required?: boolean }>;
  },
): Promise<ChecklistTemplate> {
  const name = input.name.trim();
  if (!name) throw new AppError(400, 'name is required');
  if (input.items.length === 0) throw new AppError(400, 'At least one checklist item is required');

  let inserted;
  try {
    inserted = await client.query(
      `INSERT INTO checklist_templates (tenant_id, name, entity_type, description, is_active)
       VALUES (current_tenant_id(), $1, $2, $3, $4)
       RETURNING id, name, entity_type, description, is_active, created_at, updated_at`,
      [name, input.entityType, input.description?.trim() || null, input.isActive !== false],
    );
  } catch (err) {
    throwDuplicateTemplateName(err);
  }
  const templateId = String(inserted.rows[0].id);
  let order = 0;
  for (const item of input.items) {
    const label = String(item.label || '').trim();
    if (!label) continue;
    await client.query(
      `INSERT INTO checklist_template_items (tenant_id, template_id, label, sort_order, required)
       VALUES (current_tenant_id(), $1, $2, $3, $4)`,
      [templateId, label, item.sort_order ?? order, Boolean(item.required)],
    );
    order += 10;
  }
  const created = await getChecklistTemplate(client, templateId);
  if (!created) throw new AppError(500, 'Failed to create checklist template');
  if (created.items.length === 0) throw new AppError(400, 'At least one checklist item is required');
  return created;
}

export async function updateChecklistTemplate(
  client: PoolClient,
  templateId: string,
  input: {
    name?: string;
    description?: string | null;
    isActive?: boolean;
    items?: Array<{ label: string; sort_order?: number; required?: boolean }>;
  },
): Promise<ChecklistTemplate> {
  const existing = await getChecklistTemplate(client, templateId);
  if (!existing) throw new AppError(404, 'Checklist template not found');

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  if (!name) throw new AppError(400, 'name is required');

  try {
    await client.query(
      `UPDATE checklist_templates
       SET name = $2,
           description = CASE WHEN $3::boolean THEN $4 ELSE description END,
           is_active = COALESCE($5, is_active)
       WHERE id = $1`,
      [
        templateId,
        name,
        input.description !== undefined,
        input.description === undefined ? null : (input.description?.trim() || null),
        input.isActive === undefined ? null : input.isActive,
      ],
    );
  } catch (err) {
    throwDuplicateTemplateName(err);
  }

  if (input.items) {
    if (input.items.length === 0) throw new AppError(400, 'At least one checklist item is required');
    await client.query(`DELETE FROM checklist_template_items WHERE template_id = $1`, [templateId]);
    let order = 0;
    for (const item of input.items) {
      const label = String(item.label || '').trim();
      if (!label) continue;
      await client.query(
        `INSERT INTO checklist_template_items (tenant_id, template_id, label, sort_order, required)
         VALUES (current_tenant_id(), $1, $2, $3, $4)`,
        [templateId, label, item.sort_order ?? order, Boolean(item.required)],
      );
      order += 10;
    }
  }

  const updated = await getChecklistTemplate(client, templateId);
  if (!updated) throw new AppError(404, 'Checklist template not found');
  if (updated.items.length === 0) throw new AppError(400, 'At least one checklist item is required');
  return updated;
}

export async function softDeleteChecklistTemplate(
  client: PoolClient,
  templateId: string,
): Promise<void> {
  const r = await client.query(
    `UPDATE checklist_templates SET is_active = false WHERE id = $1 RETURNING id`,
    [templateId],
  );
  if (r.rowCount === 0) throw new AppError(404, 'Checklist template not found');
}

async function loadInstanceItems(
  client: PoolClient,
  instanceId: string,
): Promise<ChecklistInstanceItem[]> {
  const r = await client.query(
    `SELECT
       i.id, i.label, i.sort_order, i.required, i.is_done,
       i.done_by, COALESCE(u.display_name, u.email) AS done_by_name,
       i.done_at
     FROM checklist_instance_items i
     LEFT JOIN users u ON u.id = i.done_by
     WHERE i.instance_id = $1
     ORDER BY i.sort_order ASC, i.label ASC`,
    [instanceId],
  );
  return r.rows as ChecklistInstanceItem[];
}

function withOpenRequired(instance: Omit<ChecklistInstance, 'open_required_count' | 'items'> & {
  items: ChecklistInstanceItem[];
}): ChecklistInstance {
  return {
    ...instance,
    open_required_count: instance.items.filter((i) => i.required && !i.is_done).length,
  };
}

export async function listChecklistInstances(
  client: PoolClient,
  entityType: ChecklistEntityType,
  entityId: string,
): Promise<ChecklistInstance[]> {
  const r = await client.query(
    `SELECT id, entity_type, entity_id, template_id, template_name, created_at
     FROM checklist_instances
     WHERE entity_type = $1 AND entity_id = $2
     ORDER BY created_at ASC`,
    [entityType, entityId],
  );
  const out: ChecklistInstance[] = [];
  for (const row of r.rows) {
    const items = await loadInstanceItems(client, String(row.id));
    out.push(withOpenRequired({
      ...(row as Omit<ChecklistInstance, 'items' | 'open_required_count'>),
      items,
    }));
  }
  return out;
}

export async function applyChecklistTemplate(
  client: PoolClient,
  input: {
    entityType: ChecklistEntityType;
    entityId: string;
    templateId: string;
  },
): Promise<ChecklistInstance> {
  await assertChecklistEntityExists(client, input.entityType, input.entityId);
  const template = await getChecklistTemplate(client, input.templateId);
  if (!template || !template.is_active) throw new AppError(404, 'Checklist template not found');
  if (template.entity_type !== input.entityType) {
    throw new AppError(400, `Template is for ${template.entity_type}, not ${input.entityType}`);
  }
  if (template.items.length === 0) throw new AppError(400, 'Template has no items');

  const existing = await client.query(
    `SELECT id FROM checklist_instances
     WHERE entity_type = $1 AND entity_id = $2 AND template_id = $3
     LIMIT 1`,
    [input.entityType, input.entityId, input.templateId],
  );
  if (existing.rows[0]) {
    throw new AppError(409, 'This checklist is already applied to the record');
  }

  const inst = await client.query(
    `INSERT INTO checklist_instances (
       tenant_id, entity_type, entity_id, template_id, template_name
     ) VALUES (
       current_tenant_id(), $1, $2, $3, $4
     ) RETURNING id, entity_type, entity_id, template_id, template_name, created_at`,
    [input.entityType, input.entityId, template.id, template.name],
  );
  const instanceId = String(inst.rows[0].id);
  for (const item of template.items) {
    await client.query(
      `INSERT INTO checklist_instance_items (
         tenant_id, instance_id, template_item_id, label, sort_order, required
       ) VALUES (
         current_tenant_id(), $1, $2, $3, $4, $5
       )`,
      [instanceId, item.id, item.label, item.sort_order, item.required],
    );
  }
  const items = await loadInstanceItems(client, instanceId);
  return withOpenRequired({
    ...(inst.rows[0] as Omit<ChecklistInstance, 'items' | 'open_required_count'>),
    items,
  });
}

export async function setChecklistItemDone(
  client: PoolClient,
  itemId: string,
  isDone: boolean,
  userId: string,
): Promise<ChecklistInstanceItem> {
  try {
    const r = await client.query<{ id: string; instance_id: string }>(
      `UPDATE checklist_instance_items
       SET is_done = $2,
           done_by = $3,
           done_at = $4
       WHERE id = $1::uuid
       RETURNING id, instance_id`,
      [
        itemId,
        isDone,
        isDone ? userId : null,
        isDone ? new Date().toISOString() : null,
      ],
    );
    if (r.rowCount === 0) throw new AppError(404, 'Checklist item not found');
    const items = await loadInstanceItems(client, String(r.rows[0].instance_id));
    const item = items.find((i) => i.id === itemId);
    if (!item) throw new AppError(404, 'Checklist item not found');
    return item;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const code = (err as { code?: string })?.code;
    if (code === '23514') {
      throw new AppError(400, 'Checklist item state is invalid', 'CHECKLIST_ITEM_STATE');
    }
    if (code === '23503') {
      throw new AppError(400, 'Invalid user for checklist completion', 'CHECKLIST_ITEM_USER');
    }
    if (code === '22P02') {
      throw new AppError(400, 'Invalid checklist item id', 'CHECKLIST_ITEM_ID');
    }
    throw err;
  }
}

export async function removeChecklistInstance(
  client: PoolClient,
  instanceId: string,
): Promise<void> {
  const r = await client.query(
    `DELETE FROM checklist_instances WHERE id = $1 RETURNING id`,
    [instanceId],
  );
  if (r.rowCount === 0) throw new AppError(404, 'Checklist instance not found');
}

/** Throws 409 if any required item is still open on the entity. */
export async function assertRequiredChecklistsComplete(
  client: PoolClient,
  entityType: ChecklistEntityType,
  entityId: string,
): Promise<void> {
  const r = await client.query(
    `SELECT COUNT(*)::int AS open_count
     FROM checklist_instance_items cii
     JOIN checklist_instances ci ON ci.id = cii.instance_id
     WHERE ci.entity_type = $1
       AND ci.entity_id = $2
       AND cii.required = true
       AND cii.is_done = false`,
    [entityType, entityId],
  );
  const openCount = Number(r.rows[0]?.open_count ?? 0);
  if (openCount > 0) {
    throw new AppError(
      409,
      `Complete ${openCount} required checklist item${openCount === 1 ? '' : 's'} before continuing`,
      'CHECKLIST_INCOMPLETE',
    );
  }
}
