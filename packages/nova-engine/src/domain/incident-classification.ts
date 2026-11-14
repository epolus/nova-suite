/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { AppError } from '../middleware/errorHandler';

export type CategoryLegacyLabels = {
  category: string | null;
  subcategory: string | null;
};

export type ResolvedCategory = CategoryLegacyLabels & {
  category_id: string;
};

export type ResolvedResolutionCode = {
  resolution_code_id: string;
  resolution_code: string;
};

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  parent_name: string | null;
  is_active: boolean;
};

type ResolutionCodeRow = {
  id: string;
  code: string;
  label: string;
  is_active: boolean;
};

function legacyLabelsFromCategory(row: CategoryRow): CategoryLegacyLabels {
  if (row.parent_id && row.parent_name) {
    return { category: row.parent_name, subcategory: row.name };
  }
  return { category: row.name, subcategory: null };
}

export async function loadIncidentCategory(
  client: PoolClient,
  categoryId: string,
): Promise<CategoryRow | null> {
  const result = await client.query<CategoryRow>(
    `SELECT c.id, c.name, c.parent_id, p.name AS parent_name, c.is_active
     FROM incident_categories c
     LEFT JOIN incident_categories p ON p.id = c.parent_id
     WHERE c.id = $1 AND c.tenant_id = current_tenant_id()`,
    [categoryId],
  );
  return result.rows[0] ?? null;
}

export async function resolveCategoryAssignment(
  client: PoolClient,
  categoryId: string | null | undefined,
  currentCategoryId: string | null | undefined,
): Promise<ResolvedCategory | { category_id: null; category: null; subcategory: null } | null> {
  if (categoryId === undefined) return null;
  if (categoryId === null) {
    return { category_id: null, category: null, subcategory: null };
  }

  const row = await loadIncidentCategory(client, categoryId);
  if (!row) throw new AppError(400, 'category_id not found');
  if (!row.is_active && row.id !== currentCategoryId) {
    throw new AppError(400, 'category_id is inactive');
  }

  return {
    category_id: row.id,
    ...legacyLabelsFromCategory(row),
  };
}

export async function resolveResolutionCodeAssignment(
  client: PoolClient,
  resolutionCodeId: string | null | undefined,
  currentResolutionCodeId: string | null | undefined,
): Promise<ResolvedResolutionCode | { resolution_code_id: null; resolution_code: null } | null> {
  if (resolutionCodeId === undefined) return null;
  if (resolutionCodeId === null) {
    return { resolution_code_id: null, resolution_code: null };
  }

  const result = await client.query<ResolutionCodeRow>(
    `SELECT id, code, label, is_active
     FROM incident_resolution_codes
     WHERE id = $1 AND tenant_id = current_tenant_id()`,
    [resolutionCodeId],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(400, 'resolution_code_id not found');
  if (!row.is_active && row.id !== currentResolutionCodeId) {
    throw new AppError(400, 'resolution_code_id is inactive');
  }

  return {
    resolution_code_id: row.id,
    resolution_code: row.code,
  };
}

export async function countCategoryReferences(
  client: PoolClient,
  categoryId: string,
): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM (
       SELECT 1 FROM incidents
       WHERE tenant_id = current_tenant_id()
         AND (category_id = $1 OR closure_category_id = $1)
       UNION ALL
       SELECT 1 FROM incident_categories
       WHERE tenant_id = current_tenant_id() AND parent_id = $1
     ) refs`,
    [categoryId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function countResolutionCodeReferences(
  client: PoolClient,
  resolutionCodeId: string,
): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM incidents
     WHERE tenant_id = current_tenant_id()
       AND resolution_code_id = $1`,
    [resolutionCodeId],
  );
  return Number(result.rows[0]?.count ?? 0);
}
