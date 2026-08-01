/* SPDX-License-Identifier: AGPL-3.0-only */
import type { AssignmentGroupItem } from '../../../api/client';

export type GroupSortOptions = {
  activeFilter: string;
  search: string;
  colFilters: Record<string, string>;
  sortBy: string;
  sortDir: 'asc' | 'desc';
};

export function sortAssignmentGroups(
  groups: AssignmentGroupItem[],
  { activeFilter, search, colFilters, sortBy, sortDir }: GroupSortOptions,
): AssignmentGroupItem[] {
  let list = groups;
  if (activeFilter === 'active') list = list.filter((i) => i.is_active);
  else if (activeFilter === 'inactive') list = list.filter((i) => !i.is_active);
  if (search) {
    list = list.filter(
      (ag) =>
        ag.name.toLowerCase().includes(search) ||
        (ag.description?.toLowerCase().includes(search) ?? false) ||
        (ag.manager_name?.toLowerCase().includes(search) ?? false),
    );
  }
  for (const [col, val] of Object.entries(colFilters)) {
    const lower = val.toLowerCase();
    list = list.filter((item) => {
      if (col === '_status') return (item.is_active ? 'active' : 'inactive').startsWith(lower);
      const raw = (item as unknown as Record<string, unknown>)[col];
      return raw != null && String(raw).toLowerCase().startsWith(lower);
    });
  }
  if (!sortBy) return list;
  return [...list].sort((a, b) => {
    let aVal: unknown;
    let bVal: unknown;
    if (sortBy === '_status') {
      aVal = a.is_active ? 0 : 1;
      bVal = b.is_active ? 0 : 1;
    } else {
      aVal = (a as unknown as Record<string, unknown>)[sortBy];
      bVal = (b as unknown as Record<string, unknown>)[sortBy];
    }
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return -1;
    if (bVal == null) return 1;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    }
    const cmp = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' });
    return sortDir === 'desc' ? -cmp : cmp;
  });
}
