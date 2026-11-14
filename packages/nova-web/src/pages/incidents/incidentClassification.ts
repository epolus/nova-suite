/* SPDX-License-Identifier: AGPL-3.0-only */
import type { IncidentCategory } from '../../api/client';

export function splitCategorySelection(
  categories: IncidentCategory[],
  categoryId: string | null | undefined,
): { rootId: string; childId: string } {
  if (!categoryId) return { rootId: '', childId: '' };
  const node = categories.find((c) => c.id === categoryId);
  if (!node) return { rootId: '', childId: '' };
  if (node.parent_id) return { rootId: node.parent_id, childId: node.id };
  return { rootId: node.id, childId: '' };
}

export function leafCategoryId(rootId: string, childId: string): string | null {
  const leaf = childId || rootId;
  return leaf || null;
}

export function rootIncidentCategories(categories: IncidentCategory[]): IncidentCategory[] {
  return categories.filter((c) => !c.parent_id);
}

export function childIncidentCategories(
  categories: IncidentCategory[],
  parentId: string,
): IncidentCategory[] {
  if (!parentId) return [];
  return categories.filter((c) => c.parent_id === parentId);
}
