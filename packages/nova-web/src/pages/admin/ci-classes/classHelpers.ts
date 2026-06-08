/* SPDX-License-Identifier: AGPL-3.0-only */
import type { useTranslations } from 'use-intl';
import type { CIClass } from '../../../api/client';

export const ICON_VALUES = ['server', 'globe', 'database', 'wifi', 'storage', 'cloud', 'printer', 'phone', 'monitor', 'other'] as const;

export const ICON_EMOJI: Record<string, string> = {
  server: '🖥️',
  globe: '🌐',
  database: '🗄️',
  wifi: '📡',
  storage: '💾',
  cloud: '☁️',
  printer: '🖨️',
  phone: '📱',
  monitor: '🖥️',
  other: '📦',
};

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
  attributes: AttrDef[];
};

export const EMPTY_CLASS: ClassDraft = {
  name: '',
  display_name: '',
  description: '',
  icon: 'server',
  parent_class: '',
  attributes: [],
};

export function iconEmoji(icon: string): string {
  return ICON_EMOJI[icon] || '📦';
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
