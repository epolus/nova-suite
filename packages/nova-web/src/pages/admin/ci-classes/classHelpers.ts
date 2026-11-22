/* SPDX-License-Identifier: AGPL-3.0-only */
import type { useTranslations } from 'use-intl';
import type { CIClass } from '../../../api/client';

export { CI_CLASS_ICON_VALUES as ICON_VALUES } from '../../../components/ciClassIcons';

export const ATTR_TYPES = ['string', 'integer', 'number', 'boolean', 'reference'];

export const REFERENCE_TABLES = [
  { value: 'users', fieldKey: 'users' as const },
  { value: 'assignment_groups', fieldKey: 'assignmentGroup' as const },
  { value: 'departments', fieldKey: 'department' as const },
  { value: 'cost_centers', fieldKey: 'costCenter' as const },
  { value: 'services', fieldKey: 'service' as const },
];

export type AttrDef = { key: string; type: string; reference_table?: string };
export type ClassDraft = {
  id?: string;
  name: string;
  display_name: string;
  description: string;
  icon: string;
  parent_class: string;
  is_active: boolean;
  attributes: AttrDef[];
};

export const EMPTY_CLASS: ClassDraft = {
  name: '',
  display_name: '',
  description: '',
  icon: 'server',
  parent_class: '',
  is_active: true,
  attributes: [],
};

export type ClassRef = {
  id: string;
  display_name: string;
  parent_class?: string | null;
};

export type ClassTreeNode<T extends ClassRef> = {
  cls: T;
  depth: number;
  children: ClassTreeNode<T>[];
};

export function buildClassTree<T extends ClassRef>(classes: T[]): ClassTreeNode<T>[] {
  const byParent = new Map<string | null, T[]>();
  const ids = new Set(classes.map((cls) => cls.id));
  for (const cls of classes) {
    const parentId = cls.parent_class && ids.has(cls.parent_class) ? cls.parent_class : null;
    const list = byParent.get(parentId) ?? [];
    list.push(cls);
    byParent.set(parentId, list);
  }

  const byName = (a: T, b: T) => a.display_name.localeCompare(b.display_name);
  const walk = (parentId: string | null, depth: number, stack: Set<string>): ClassTreeNode<T>[] =>
    (byParent.get(parentId) ?? []).sort(byName).flatMap((cls) => {
      if (stack.has(cls.id)) return [];
      const next = new Set(stack);
      next.add(cls.id);
      return [{ cls, depth, children: walk(cls.id, depth + 1, next) }];
    });

  const roots = walk(null, 0, new Set());
  const seen = new Set<string>();
  const mark = (nodes: ClassTreeNode<T>[]) => {
    for (const node of nodes) {
      seen.add(node.cls.id);
      mark(node.children);
    }
  };
  mark(roots);
  for (const cls of classes.filter((item) => !seen.has(item.id)).sort(byName)) {
    roots.push({ cls, depth: 0, children: [] });
  }
  return roots;
}

export function flattenClassTree<T extends ClassRef>(nodes: ClassTreeNode<T>[]): ClassTreeNode<T>[] {
  const out: ClassTreeNode<T>[] = [];
  const walk = (list: ClassTreeNode<T>[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

export function filterClassTree<T extends ClassRef>(
  nodes: ClassTreeNode<T>[],
  predicate: (cls: T) => boolean,
): ClassTreeNode<T>[] {
  const out: ClassTreeNode<T>[] = [];
  for (const node of nodes) {
    const children = filterClassTree(node.children, predicate);
    if (predicate(node.cls) || children.length > 0) {
      out.push({ ...node, children });
    }
  }
  return out;
}

export function descendantIds(classId: string, classes: ClassRef[]): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const cls of classes) {
    if (!cls.parent_class) continue;
    const list = childrenByParent.get(cls.parent_class) ?? [];
    list.push(cls.id);
    childrenByParent.set(cls.parent_class, list);
  }
  const out = new Set<string>();
  const stack = [...(childrenByParent.get(classId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || out.has(id)) continue;
    out.add(id);
    stack.push(...(childrenByParent.get(id) ?? []));
  }
  return out;
}

export function classPath<T extends ClassRef>(cls: T, classes: T[]): string[] {
  const byId = new Map(classes.map((item) => [item.id, item]));
  const names: string[] = [];
  const seen = new Set<string>();
  let current: T | undefined = cls;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.display_name);
    current = current.parent_class ? byId.get(current.parent_class) : undefined;
  }
  return names;
}

export function classOptionLabel(displayName: string, depth: number): string {
  return `${'\u00A0\u00A0'.repeat(depth)}${displayName}`;
}

export function subtreeCiCounts(
  classes: Array<{ id: string; parent_class?: string | null; ci_count?: number }>,
): Map<string, number> {
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const total = (id: string): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const cls = classes.find((item) => item.id === id);
    let sum = cls?.ci_count ?? 0;
    for (const child of classes) {
      if (child.parent_class === id) sum += total(child.id);
    }
    visiting.delete(id);
    memo.set(id, sum);
    return sum;
  };
  for (const cls of classes) total(cls.id);
  return memo;
}

export function classMatchesQuery(
  cls: { display_name: string; name?: string; description?: string | null },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return cls.display_name.toLowerCase().includes(needle)
    || (cls.name ?? '').toLowerCase().includes(needle)
    || (cls.description ?? '').toLowerCase().includes(needle);
}

export function attrsToList(attrs: Record<string, { type: string; reference_table?: string }>): AttrDef[] {
  return Object.entries(attrs).map(([key, val]) => ({
    key,
    type: val.type || 'string',
    reference_table: val.reference_table,
  }));
}

export function attrsToRecord(list: AttrDef[]): Record<string, { type: string; reference_table?: string }> {
  const rec: Record<string, { type: string; reference_table?: string }> = {};
  for (const a of list) {
    if (a.key.trim()) {
      const entry: { type: string; reference_table?: string } = { type: a.type };
      if (a.type === 'reference' && a.reference_table) entry.reference_table = a.reference_table;
      rec[a.key.trim()] = entry;
    }
  }
  return rec;
}

export function getInheritedAttrs(parentId: string, allClasses: CIClass[]): AttrDef[] {
  const result: AttrDef[] = [];
  const visited = new Set<string>();
  let currentId: string | null = parentId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const cls = allClasses.find((c) => c.id === currentId);
    if (!cls) break;
    for (const [key, val] of Object.entries(cls.attributes)) {
      if (!result.some((a) => a.key === key)) {
        result.push({ key, type: val.type || 'string', reference_table: val.reference_table });
      }
    }
    currentId = cls.parent_class;
  }
  return result;
}

export function formatAttrType(
  attr: AttrDef,
  tPage: ReturnType<typeof useTranslations<'pages.admin.ciClasses'>>,
  tFields: ReturnType<typeof useTranslations<'common.fields'>>,
): string {
  if (attr.type === 'reference' && attr.reference_table) {
    const tbl = REFERENCE_TABLES.find((t) => t.value === attr.reference_table);
    const label = tbl ? tFields(tbl.fieldKey) : attr.reference_table;
    return `${tPage('refPrefix')} ${label}`;
  }
  return attr.type;
}
