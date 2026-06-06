/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';

export interface CatalogCategoryHit {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
}

export interface CatalogItemHit {
  id: string;
  name: string;
  short_description: string | null;
  category_id: string;
  category_name: string;
  price: number | null;
  approval_required: boolean;
  sla_hours: number | null;
  path: string;
}

export interface CatalogItemDetail extends CatalogItemHit {
  form_fields: Array<{ name: string; label: string; type: string; required: boolean }>;
}

function summarizeFormSchema(raw: unknown): CatalogItemDetail['form_fields'] {
  if (!raw || typeof raw !== 'object') return [];
  const fields = (raw as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return [];
  return fields
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .map((f) => ({
      name: String(f.name ?? ''),
      label: String(f.label ?? f.name ?? ''),
      type: String(f.type ?? 'text'),
      required: f.required === true,
    }))
    .filter((f) => f.name);
}

export async function listCatalogCategories(client: PoolClient): Promise<CatalogCategoryHit[]> {
  const res = await client.query(
    `SELECT id, name, description, icon
     FROM service_categories
     WHERE is_active = true
     ORDER BY sort_order, name`,
  );
  return res.rows as CatalogCategoryHit[];
}

export async function searchCatalogItems(
  client: PoolClient,
  params: { query?: string; category?: string; limit?: number },
): Promise<CatalogItemHit[]> {
  const limit = Math.min(params.limit ?? 8, 20);
  const query = (params.query ?? '').trim();
  const category = (params.category ?? '').trim();

  const conditions = ['si.is_active = true', 'sc.is_active = true'];
  const sqlParams: unknown[] = [];
  let idx = 1;

  if (query) {
    conditions.push(
      `(si.name ILIKE $${idx} OR si.short_description ILIKE $${idx} OR sc.name ILIKE $${idx})`,
    );
    sqlParams.push(`%${query}%`);
    idx++;
  }
  if (category) {
    conditions.push(`(sc.name ILIKE $${idx} OR sc.name ILIKE $${idx + 1})`);
    sqlParams.push(category, `%${category}%`);
    idx += 2;
  }

  sqlParams.push(limit);

  const res = await client.query(
    `SELECT si.id, si.name, si.short_description, si.category_id, si.price,
            si.approval_required, si.sla_hours, sc.name AS category_name
     FROM service_items si
     JOIN service_categories sc ON sc.id = si.category_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY sc.sort_order, si.name
     LIMIT $${idx}`,
    sqlParams,
  );

  return res.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    name: String(row.name),
    short_description: row.short_description ? String(row.short_description) : null,
    category_id: String(row.category_id),
    category_name: String(row.category_name),
    price: row.price != null ? Number(row.price) : null,
    approval_required: row.approval_required === true,
    sla_hours: row.sla_hours != null ? Number(row.sla_hours) : null,
    path: `/catalog/${row.id}`,
  }));
}

export async function getCatalogItemDetail(
  client: PoolClient,
  itemId: string,
): Promise<CatalogItemDetail | null> {
  const res = await client.query(
    `SELECT si.id, si.name, si.short_description, si.category_id, si.price,
            si.approval_required, si.sla_hours, si.form_schema, sc.name AS category_name
     FROM service_items si
     JOIN service_categories sc ON sc.id = si.category_id
     WHERE si.id = $1 AND si.is_active = true AND sc.is_active = true`,
    [itemId],
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0] as Record<string, unknown>;
  return {
    id: String(row.id),
    name: String(row.name),
    short_description: row.short_description ? String(row.short_description) : null,
    category_id: String(row.category_id),
    category_name: String(row.category_name),
    price: row.price != null ? Number(row.price) : null,
    approval_required: row.approval_required === true,
    sla_hours: row.sla_hours != null ? Number(row.sla_hours) : null,
    path: `/catalog/${row.id}`,
    form_fields: summarizeFormSchema(row.form_schema),
  };
}
