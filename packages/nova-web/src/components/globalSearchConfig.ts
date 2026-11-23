/* SPDX-License-Identifier: AGPL-3.0-only */
import type { SearchResult } from '../api/client';

export type IconName =
  | 'home'
  | 'check'
  | 'users'
  | 'incident'
  | 'major_incident'
  | 'change'
  | 'problem'
  | 'knowledge'
  | 'ci'
  | 'catalog'
  | 'request'
  | 'request_tasks'
  | 'assets'
  | 'releases'
  | 'reports'
  | 'user'
  | 'department'
  | 'cost_center'
  | 'company'
  | 'location'
  | 'roles'
  | 'classes'
  | 'sla'
  | 'workflow'
  | 'settings'
  | 'theme'
  | 'import'
  | 'service_item'
  | 'services'
  | 'processes'
  | 'notifications'
  | 'mailbox'
  | 'notification_deliveries'
  | 'data_sources'
  | 'credentials'
  | 'config_packages'
  | 'status'
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

/**
 * Quick-nav destinations for Ctrl+K. Keep in sync with
 * `layout/agentNavConfig.ts` (agentNav + adminSections).
 * Access is filtered in GlobalSearch (same rules as the sidebar).
 */
export const NAV_ITEM_DEFS: NavItemDef[] = [
  // Agent
  { id: 'dashboard', path: '/', icon: 'home' },
  { id: 'myTodo', path: '/my-todo', icon: 'check' },
  { id: 'workbench', path: '/workbench', icon: 'record' },
  { id: 'myGroups', path: '/my-groups', icon: 'users' },
  { id: 'catalog', path: '/catalog', icon: 'catalog' },
  { id: 'knowledge', path: '/knowledge', icon: 'knowledge' },
  { id: 'requests', path: '/requests', icon: 'request' },
  { id: 'requestTasks', path: '/request-tasks', icon: 'request_tasks' },
  { id: 'incidents', path: '/incidents', icon: 'incident' },
  { id: 'alerts', path: '/alerts', icon: 'incident' },
  { id: 'onCall', path: '/on-call', icon: 'users' },
  { id: 'majorIncidents', path: '/major-incidents', icon: 'major_incident' },
  { id: 'problems', path: '/problems', icon: 'problem' },
  { id: 'changes', path: '/changes', icon: 'change' },
  { id: 'improvements', path: '/improvements', icon: 'check' },
  { id: 'assets', path: '/assets', icon: 'assets' },
  { id: 'releases', path: '/releases', icon: 'releases' },
  { id: 'reports', path: '/reports', icon: 'reports' },
  { id: 'cmdb', path: '/cmdb', icon: 'ci' },
  // Admin · Organization
  { id: 'adminUsers', path: '/admin/users', icon: 'user', adminOnly: true },
  { id: 'adminDepartments', path: '/admin/departments', icon: 'department', adminOnly: true },
  { id: 'adminCostCenters', path: '/admin/cost-centers', icon: 'cost_center', adminOnly: true },
  { id: 'adminCompanies', path: '/admin/companies', icon: 'company', adminOnly: true },
  { id: 'adminLocations', path: '/admin/locations', icon: 'location', adminOnly: true },
  { id: 'adminRoles', path: '/admin/roles', icon: 'roles', adminOnly: true },
  { id: 'adminAssignmentGroups', path: '/admin/assignment-groups', icon: 'users', adminOnly: true },
  // Admin · Service Catalog
  { id: 'adminServices', path: '/admin/services', icon: 'services', adminOnly: true },
  { id: 'adminCategories', path: '/admin/categories', icon: 'catalog', adminOnly: true },
  { id: 'adminServiceItems', path: '/admin/service-items', icon: 'service_item', adminOnly: true },
  { id: 'adminFulfillmentModels', path: '/admin/fulfillment-models', icon: 'service_item', adminOnly: true },
  { id: 'adminCatalogTasks', path: '/admin/catalog-tasks', icon: 'request_tasks', adminOnly: true },
  // Admin · Process & Automation
  { id: 'adminProcesses', path: '/admin/processes', icon: 'processes', adminOnly: true },
  { id: 'adminIncidentClassification', path: '/admin/incident-classification', icon: 'incident', adminOnly: true },
  { id: 'adminCustomFields', path: '/admin/custom-fields', icon: 'settings', adminOnly: true },
  { id: 'adminSlaConfig', path: '/admin/sla-config', icon: 'sla', adminOnly: true },
  { id: 'adminBusinessCalendars', path: '/admin/business-calendars', icon: 'sla', adminOnly: true },
  { id: 'adminNotificationConfig', path: '/admin/notification-config', icon: 'notifications', adminOnly: true },
  { id: 'adminAlertDefinitions', path: '/admin/alert-definitions', icon: 'notifications', adminOnly: true },
  { id: 'adminInboundEmail', path: '/admin/inbound-email', icon: 'mailbox', adminOnly: true },
  { id: 'adminEmailTemplates', path: '/admin/email-templates', icon: 'mailbox', adminOnly: true },
  { id: 'adminChecklists', path: '/admin/checklists', icon: 'settings', adminOnly: true },
  { id: 'adminNotificationDeliveries', path: '/admin/notification-deliveries', icon: 'notification_deliveries', adminOnly: true },
  { id: 'adminChangeManagement', path: '/admin/change-management', icon: 'change', adminOnly: true },
  { id: 'adminKnowledgeWorkflows', path: '/admin/knowledge-workflows', icon: 'knowledge', adminOnly: true },
  { id: 'adminWorkflows', path: '/admin/workflows', icon: 'workflow', adminOnly: true },
  { id: 'adminWorkflowEditor', path: '/admin/workflows/editor', icon: 'workflow', adminOnly: true },
  // Admin · CMDB
  { id: 'adminCiClasses', path: '/admin/ci-classes', icon: 'classes', adminOnly: true },
  // Admin · Data & Integration
  { id: 'adminDataSources', path: '/admin/data-sources', icon: 'data_sources', adminOnly: true },
  { id: 'adminCredentials', path: '/admin/credentials', icon: 'credentials', adminOnly: true },
  { id: 'adminConfigPackages', path: '/admin/config-packages', icon: 'config_packages', adminOnly: true },
  { id: 'adminServiceNowMigration', path: '/admin/migrations/servicenow', icon: 'import', adminOnly: true },
  { id: 'adminImport', path: '/admin/import', icon: 'import', adminOnly: true },
  { id: 'adminDataManagement', path: '/admin/data-management', icon: 'data_sources', adminOnly: true },
  // Admin · System
  { id: 'adminSystemStatus', path: '/admin/system-status', icon: 'status', adminOnly: true },
  { id: 'adminTheming', path: '/admin/theming', icon: 'theme', adminOnly: true },
  { id: 'adminAiSettings', path: '/admin/ai-settings', icon: 'settings', adminOnly: true },
];

export const COMMAND_NAMES = ['inc', 'chg', 'prb', 'kb', 'ci', 'cat', 'help'] as const;

export const COMMAND_TYPES: Record<(typeof COMMAND_NAMES)[number], SearchResult['type'] | null> = {
  inc: 'incident',
  chg: 'change',
  prb: 'problem',
  kb: 'knowledge',
  ci: 'ci',
  cat: 'catalog',
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
  catalog: 'catalog',
  service_item: 'catalog',
};

export const CMD_ICON: Record<string, IconName> = {
  inc: 'incident',
  chg: 'change',
  prb: 'problem',
  kb: 'knowledge',
  ci: 'ci',
  cat: 'catalog',
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
  if (value === 'service_item') return 'catalog';
  return value;
}
