/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { AppError } from '../middleware/errorHandler';

export const CUSTOM_FIELD_ENTITY_TYPES = ['incident', 'change', 'asset'] as const;
export type CustomFieldEntityType = (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];

export const CUSTOM_FIELD_TYPES = [
  'text', 'textarea', 'date', 'number', 'email', 'checkbox',
  'select', 'multiselect', 'cmdb_ref', 'user_ref', 'location_ref',
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_REQUIRED_ON = ['', 'create', 'resolve'] as const;
export type CustomFieldRequiredOn = (typeof CUSTOM_FIELD_REQUIRED_ON)[number];

export type FieldDefinitionRow = {
  id: string;
  entity_type: CustomFieldEntityType;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  config: Record<string, unknown>;
  required_on: CustomFieldRequiredOn;
  sort_order: number;
  is_active: boolean;
};

export type FieldOptionRow = {
  id: string;
  field_id: string;
  value: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

export type FieldValueColumns = {
  value_text: string | null;
  value_number: number | null;
  value_bool: boolean | null;
  value_timestamptz: string | null;
  value_json: unknown | null;
};

export function isCustomFieldEntityType(value: unknown): value is CustomFieldEntityType {
  return typeof value === 'string'
    && (CUSTOM_FIELD_ENTITY_TYPES as readonly string[]).includes(value);
}

export function isCustomFieldType(value: unknown): value is CustomFieldType {
  return typeof value === 'string'
    && (CUSTOM_FIELD_TYPES as readonly string[]).includes(value);
}

export function emptyValueColumns(): FieldValueColumns {
  return {
    value_text: null,
    value_number: null,
    value_bool: null,
    value_timestamptz: null,
    value_json: null,
  };
}

export function serializeFieldValue(
  fieldType: CustomFieldType,
  cols: FieldValueColumns,
): unknown {
  switch (fieldType) {
    case 'number':
      return cols.value_number;
    case 'checkbox':
      return cols.value_bool;
    case 'date':
      return cols.value_timestamptz;
    case 'multiselect':
      return cols.value_json ?? [];
    default:
      return cols.value_text;
  }
}

function isEmailAddress(val: string): boolean {
  const at = val.indexOf('@');
  if (at <= 0 || val.indexOf('@', at + 1) !== -1 || /\s/.test(val)) return false;
  const domain = val.slice(at + 1);
  for (let i = 1; i < domain.length - 1; i++) {
    if (domain[i] === '.') return true;
  }
  return false;
}

export function coerceFieldValue(
  def: FieldDefinitionRow,
  raw: unknown,
  options: string[],
): FieldValueColumns {
  const cols = emptyValueColumns();
  const label = def.label || def.field_key;

  if (def.field_type === 'checkbox') {
    if (raw === true || raw === 'true' || raw === '1' || raw === 1) {
      cols.value_bool = true;
    } else if (raw === false || raw === 'false' || raw === '0' || raw === 0 || raw == null || raw === '') {
      cols.value_bool = false;
    } else {
      throw new AppError(400, `${label} must be a boolean`);
    }
    return cols;
  }

  if (def.field_type === 'multiselect') {
    let arr: unknown[];
    if (raw == null || raw === '') arr = [];
    else if (Array.isArray(raw)) arr = raw;
    else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        arr = Array.isArray(parsed) ? parsed : [raw];
      } catch {
        arr = raw.split(',').map((s) => s.trim()).filter(Boolean);
      }
    } else {
      throw new AppError(400, `${label} must be an array`);
    }
    const values = arr.map((v) => String(v));
    if (options.length > 0) {
      for (const v of values) {
        if (!options.includes(v)) throw new AppError(400, `${label}: invalid option ${v}`);
      }
    }
    cols.value_json = values;
    return cols;
  }

  if (raw == null || raw === '') {
    return cols;
  }

  const text = String(raw).trim();
  if (!text) return cols;

  if (def.field_type === 'number') {
    const n = Number(text);
    if (Number.isNaN(n)) throw new AppError(400, `${label} must be a number`);
    const min = typeof def.config.min === 'number' ? def.config.min : undefined;
    const max = typeof def.config.max === 'number' ? def.config.max : undefined;
    if (min != null && n < min) throw new AppError(400, `${label}: minimum is ${min}`);
    if (max != null && n > max) throw new AppError(400, `${label}: maximum is ${max}`);
    cols.value_number = n;
    return cols;
  }

  if (def.field_type === 'email' && !isEmailAddress(text)) {
    throw new AppError(400, `${label} must be a valid email`);
  }

  if (def.field_type === 'select' && options.length > 0 && !options.includes(text)) {
    throw new AppError(400, `${label}: invalid option`);
  }

  if (def.field_type === 'date') {
    const d = new Date(text);
    if (Number.isNaN(d.getTime())) throw new AppError(400, `${label} must be a valid date`);
    cols.value_timestamptz = d.toISOString();
    return cols;
  }

  const pattern = typeof def.config.pattern === 'string' ? def.config.pattern : undefined;
  if (pattern) {
    try {
      if (!new RegExp(pattern).test(text)) {
        throw new AppError(400, `${label} does not match the required format`);
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
    }
  }

  cols.value_text = text;
  return cols;
}

export function isValueEmpty(fieldType: CustomFieldType, cols: FieldValueColumns): boolean {
  switch (fieldType) {
    case 'number':
      return cols.value_number == null;
    case 'checkbox':
      return cols.value_bool == null || cols.value_bool === false;
    case 'date':
      return cols.value_timestamptz == null;
    case 'multiselect':
      return !Array.isArray(cols.value_json) || (cols.value_json as unknown[]).length === 0;
    default:
      return cols.value_text == null || cols.value_text.trim() === '';
  }
}

export async function listFieldDefinitions(
  client: PoolClient,
  entityType: CustomFieldEntityType,
  opts: { activeOnly?: boolean } = {},
): Promise<FieldDefinitionRow[]> {
  const result = await client.query<FieldDefinitionRow>(
    `SELECT id, entity_type, field_key, label, field_type, config, required_on, sort_order, is_active
     FROM field_definitions
     WHERE tenant_id = current_tenant_id()
       AND entity_type = $1
       AND ($2::boolean OR is_active = true)
     ORDER BY sort_order, label`,
    [entityType, opts.activeOnly === false],
  );
  return result.rows.map((r) => ({
    ...r,
    config: (r.config && typeof r.config === 'object' ? r.config : {}) as Record<string, unknown>,
  }));
}

export async function listFieldOptions(
  client: PoolClient,
  fieldIds: string[],
  opts: { activeOnly?: boolean } = {},
): Promise<FieldOptionRow[]> {
  if (fieldIds.length === 0) return [];
  const result = await client.query<FieldOptionRow>(
    `SELECT id, field_id, value, label, sort_order, is_active
     FROM field_options
     WHERE tenant_id = current_tenant_id()
       AND field_id = ANY($1::uuid[])
       AND ($2::boolean OR is_active = true)
     ORDER BY sort_order, label`,
    [fieldIds, opts.activeOnly === false],
  );
  return result.rows;
}

export async function loadCustomFieldsMap(
  client: PoolClient,
  entityType: CustomFieldEntityType,
  entityId: string,
): Promise<Record<string, unknown>> {
  const result = await client.query<{
    field_key: string;
    field_type: CustomFieldType;
    value_text: string | null;
    value_number: string | null;
    value_bool: boolean | null;
    value_timestamptz: string | null;
    value_json: unknown;
  }>(
    `SELECT d.field_key, d.field_type,
            v.value_text, v.value_number, v.value_bool, v.value_timestamptz, v.value_json
     FROM field_values v
     JOIN field_definitions d ON d.id = v.field_id
     WHERE v.tenant_id = current_tenant_id()
       AND v.entity_type = $1
       AND v.entity_id = $2`,
    [entityType, entityId],
  );
  const out: Record<string, unknown> = {};
  for (const row of result.rows) {
    out[row.field_key] = serializeFieldValue(row.field_type, {
      value_text: row.value_text,
      value_number: row.value_number == null ? null : Number(row.value_number),
      value_bool: row.value_bool,
      value_timestamptz: row.value_timestamptz,
      value_json: row.value_json,
    });
  }
  return out;
}

export async function countFieldValues(
  client: PoolClient,
  fieldId: string,
): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM field_values
     WHERE tenant_id = current_tenant_id() AND field_id = $1`,
    [fieldId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function upsertCustomFields(
  client: PoolClient,
  entityType: CustomFieldEntityType,
  entityId: string,
  values: Record<string, unknown> | undefined,
  phase: 'create' | 'update' | 'resolve',
): Promise<void> {
  if (values === undefined && phase === 'update') return;

  const defs = await listFieldDefinitions(client, entityType, { activeOnly: true });
  const options = await listFieldOptions(client, defs.map((d) => d.id), { activeOnly: true });
  const optionsByField = new Map<string, string[]>();
  for (const opt of options) {
    const list = optionsByField.get(opt.field_id) ?? [];
    list.push(opt.value);
    optionsByField.set(opt.field_id, list);
  }

  const existing = values === undefined
    ? await loadCustomFieldsMap(client, entityType, entityId)
    : null;
  const incoming = values ?? {};

  for (const def of defs) {
    const hasKey = Object.prototype.hasOwnProperty.call(incoming, def.field_key);
    const raw = hasKey ? incoming[def.field_key] : (existing ? existing[def.field_key] : undefined);
    const cols = coerceFieldValue(def, raw, optionsByField.get(def.id) ?? []);
    const empty = isValueEmpty(def.field_type, cols);

    const requireNow = (def.required_on === 'create' && phase === 'create')
      || (def.required_on === 'resolve' && phase === 'resolve');
    if (requireNow && empty) {
      throw new AppError(400, `${def.label || def.field_key} is required`);
    }

    if (!hasKey && phase !== 'create') continue;

    if (empty) {
      await client.query(
        `DELETE FROM field_values
         WHERE tenant_id = current_tenant_id()
           AND entity_type = $1
           AND entity_id = $2
           AND field_id = $3`,
        [entityType, entityId, def.id],
      );
      continue;
    }

    await client.query(
      `INSERT INTO field_values (
         tenant_id, entity_type, entity_id, field_id,
         value_text, value_number, value_bool, value_timestamptz, value_json
       ) VALUES (
         current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8
       )
       ON CONFLICT (tenant_id, entity_type, entity_id, field_id) DO UPDATE SET
         value_text = EXCLUDED.value_text,
         value_number = EXCLUDED.value_number,
         value_bool = EXCLUDED.value_bool,
         value_timestamptz = EXCLUDED.value_timestamptz,
         value_json = EXCLUDED.value_json,
         updated_at = now()`,
      [
        entityType, entityId, def.id,
        cols.value_text, cols.value_number, cols.value_bool,
        cols.value_timestamptz, cols.value_json,
      ],
    );
  }
}
