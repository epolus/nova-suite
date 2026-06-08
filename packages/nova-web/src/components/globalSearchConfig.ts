/* SPDX-License-Identifier: AGPL-3.0-only */
import type { SearchResult } from '../api/client';

export type IconName =
  | 'home'
  | 'check'
  | 'users'
  | 'incident'
  | 'change'
  | 'problem'
  | 'knowledge'
  | 'ci'
  | 'catalog'
  | 'request'
  | 'user'
  | 'department'
  | 'classes'
  | 'sla'
  | 'workflow'
  | 'settings'
  | 'theme'
  | 'import'
  | 'service_item'
  | 'help'
  | 'record';

export interface NavItem {
  id: string;
  title: string;
  subtitle: string;
  path: string;
  icon: IconName;
  adminOnly?: boolean;
}

export type NavItemDef = {
  id: string;
  path: string;
  icon: IconName;
  adminOnly?: boolean;
};

export const NAV_ITEM_DEFS: NavItemDef[] = [
  { id: 'dashboard', path: '/', icon: 'home' },
  { id: 'myTodo', path: '/my-todo', icon: 'check' },
  { id: 'myGroups', path: '/my-groups', icon: 'users' },
  { id: 'incidents', path: '/incidents', icon: 'incident' },
  { id: 'changes', path: '/changes', icon: 'change' },
  { id: 'problems', path: '/problems', icon: 'problem' },
  { id: 'knowledge', path: '/knowledge', icon: 'knowledge' },
  { id: 'cmdb', path: '/cmdb', icon: 'ci' },
  { id: 'catalog', path: '/catalog', icon: 'catalog' },
  { id: 'requests', path: '/requests', icon: 'request' },
  { id: 'adminUsers', path: '/admin/users', icon: 'user', adminOnly: true },
  { id: 'adminDepartments', path: '/admin/departments', icon: 'department', adminOnly: true },
  { id: 'adminCompanies', path: '/admin/companies', icon: 'department', adminOnly: true },
  { id: 'adminLocations', path: '/admin/locations', icon: 'department', adminOnly: true },
  { id: 'adminAssignmentGroups', path: '/admin/assignment-groups', icon: 'users', adminOnly: true },
  { id: 'adminCiClasses', path: '/admin/ci-classes', icon: 'classes', adminOnly: true },
  { id: 'adminSlaConfig', path: '/admin/sla-config', icon: 'sla', adminOnly: true },
  { id: 'adminKnowledgeWorkflows', path: '/admin/knowledge-workflows', icon: 'workflow', adminOnly: true },
  { id: 'adminChangeManagement', path: '/admin/change-management', icon: 'settings', adminOnly: true },
  { id: 'adminSystemStatus', path: '/admin/system-status', icon: 'settings', adminOnly: true },
  { id: 'adminTheming', path: '/admin/theming', icon: 'theme', adminOnly: true },
  { id: 'adminImport', path: '/admin/import', icon: 'import', adminOnly: true },
  { id: 'adminServiceItems', path: '/admin/service-items', icon: 'service_item', adminOnly: true },
];

export const COMMAND_NAMES = ['inc', 'chg', 'prb', 'kb', 'ci', 'help'] as const;

export const COMMAND_TYPES: Record<(typeof COMMAND_NAMES)[number], SearchResult['type'] | null> = {
  inc: 'incident',
  chg: 'change',
  prb: 'problem',
  kb: 'knowledge',
  ci: 'ci',
  help: null,
};

export type SearchCommand = {
  name: (typeof COMMAND_NAMES)[number];
  label: string;
  type: SearchResult['type'] | null;
  description: string;
};

export type ParsedCmd = { cmd: string; term: string; hasSpace: boolean };

export function parseCmd(q: string): ParsedCmd | null {
  if (!q.startsWith('/')) return null;
  const m = q.match(/^\/(\w*)(\s(.*))?$/);
  if (!m) return null;
  return { cmd: m[1] ?? '', term: m[3] ?? '', hasSpace: Boolean(m[2]) };
}

export const TYPE_ICON: Record<string, IconName> = {
  incident: 'incident',
  change: 'change',
  problem: 'problem',
  knowledge: 'knowledge',
  kb: 'knowledge',
  ci: 'ci',
  configuration_item: 'ci',
};

export const CMD_ICON: Record<string, IconName> = {
  inc: 'incident',
  chg: 'change',
  prb: 'problem',
  kb: 'knowledge',
  ci: 'ci',
  help: 'help',
};

export function scoreNav(item: NavItem, q: string): number {
  const lq = q.toLowerCase();
  const lt = item.title.toLowerCase();
  const ls = item.subtitle.toLowerCase();
  if (lt === lq) return 2;
  if (lt.startsWith(lq)) return 1.5;
  if (lt.includes(lq) || ls.includes(lq)) return 1;
  return 0;
}

export function normalizeResultType(type: string): string {
  const value = String(type || '').toLowerCase();
  if (value === 'kb') return 'knowledge';
  if (value === 'configuration_item') return 'ci';
  return value;
}
