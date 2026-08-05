/* SPDX-License-Identifier: AGPL-3.0-only */
import type { IconName } from '../globalSearchConfig';

export type NavItemDef = { to: string; label: string; icon: IconName };
export type RawNavItemDef = { to: string; labelKey: string; icon: IconName };
export type AdminSection = { key: string; label: string; icon: IconName; items: NavItemDef[] };
export type RawAdminSection = { key: string; labelKey: string; icon: IconName; items: RawNavItemDef[] };

export const agentNav: RawNavItemDef[] = [
  { to: '/', labelKey: 'agent.dashboard', icon: 'home' },
  { to: '/my-todo', labelKey: 'agent.myTodo', icon: 'check' },
  { to: '/my-groups', labelKey: 'agent.myGroups', icon: 'users' },
  { to: '/catalog', labelKey: 'agent.catalog', icon: 'catalog' },
  { to: '/knowledge', labelKey: 'agent.knowledge', icon: 'knowledge' },
  { to: '/requests', labelKey: 'agent.requests', icon: 'request' },
  { to: '/request-tasks', labelKey: 'agent.requestTasks', icon: 'request_tasks' },
  { to: '/incidents', labelKey: 'agent.incidents', icon: 'incident' },
  { to: '/major-incidents', labelKey: 'agent.majorIncidents', icon: 'major_incident' },
  { to: '/problems', labelKey: 'agent.problems', icon: 'problem' },
  { to: '/changes', labelKey: 'agent.changes', icon: 'change' },
  { to: '/assets', labelKey: 'agent.assets', icon: 'assets' },
  { to: '/releases', labelKey: 'agent.releases', icon: 'releases' },
  { to: '/reports', labelKey: 'agent.reports', icon: 'reports' },
  { to: '/cmdb', labelKey: 'agent.cmdb', icon: 'ci' },
];

export const catalogDesignerNav: RawNavItemDef[] = [
  { to: '/admin/service-items', labelKey: 'admin.serviceItems', icon: 'service_item' },
  { to: '/admin/catalog-tasks', labelKey: 'admin.catalogTasks', icon: 'request_tasks' },
];

export function isWorkflowEditorPath(pathname: string): boolean {
  return pathname === '/admin/workflows/editor' || pathname.startsWith('/admin/workflows/editor/')
    || pathname === '/admin/workflows/designer' || pathname.startsWith('/admin/workflows/designer/');
}

export function isWorkflowExecutionDetailPath(pathname: string): boolean {
  return /^\/admin\/workflows\/[^/]+\/[^/]+$/.test(pathname);
}

export function isNavItemActive(itemTo: string, pathname: string | undefined, fallbackIsActive: boolean): boolean {
  if (!pathname) return fallbackIsActive;
  if (itemTo === '/admin/workflows') {
    return pathname === '/admin/workflows' || isWorkflowExecutionDetailPath(pathname);
  }
  if (itemTo === '/admin/workflows/editor') {
    return isWorkflowEditorPath(pathname);
  }
  return fallbackIsActive;
}

export function useFullWidthContent(pathname: string): boolean {
  if (isWorkflowEditorPath(pathname)) return true;
  if (pathname === '/admin/catalog-tasks' || pathname.startsWith('/admin/catalog-tasks/')) return true;
  const fullWidthPaths = new Set([
    '/my-todo',
    '/my-groups',
    '/incidents',
    '/major-incidents',
    '/requests',
    '/request-tasks',
    '/changes',
    '/assets',
    '/releases',
    '/problems',
    '/cmdb',
    '/admin/workflows',
    '/admin/service-items',
    '/admin/data-sources',
  ]);
  return fullWidthPaths.has(pathname);
}

/** Pages that should fill the main content pane instead of scrolling the whole page. */
export function useFillHeightContent(pathname: string): boolean {
  return isWorkflowEditorPath(pathname);
}

export const adminSections: RawAdminSection[] = [
  {
    key: 'org',
    labelKey: 'adminSections.organization',
    icon: 'department',
    items: [
      { to: '/admin/users', labelKey: 'admin.users', icon: 'user' },
      { to: '/admin/departments', labelKey: 'admin.departments', icon: 'department' },
      { to: '/admin/cost-centers', labelKey: 'admin.costCenters', icon: 'cost_center' },
      { to: '/admin/companies', labelKey: 'admin.companies', icon: 'company' },
      { to: '/admin/locations', labelKey: 'admin.locations', icon: 'location' },
      { to: '/admin/roles', labelKey: 'admin.roles', icon: 'roles' },
      { to: '/admin/assignment-groups', labelKey: 'admin.assignmentGroups', icon: 'users' },
    ],
  },
  {
    key: 'catalog',
    labelKey: 'adminSections.serviceCatalog',
    icon: 'catalog',
    items: [
      { to: '/admin/services', labelKey: 'admin.services', icon: 'services' },
      { to: '/admin/service-items', labelKey: 'admin.serviceItems', icon: 'service_item' },
      { to: '/admin/catalog-tasks', labelKey: 'admin.catalogTasks', icon: 'request_tasks' },
    ],
  },
  {
    key: 'process',
    labelKey: 'adminSections.processAutomation',
    icon: 'settings',
    items: [
      { to: '/admin/processes', labelKey: 'admin.processes', icon: 'processes' },
      { to: '/admin/sla-config', labelKey: 'admin.slaConfiguration', icon: 'sla' },
      { to: '/admin/notification-config', labelKey: 'admin.notificationWorkflows', icon: 'notifications' },
      { to: '/admin/notification-deliveries', labelKey: 'admin.notificationDeliveries', icon: 'notification_deliveries' },
      { to: '/admin/change-management', labelKey: 'admin.changeManagement', icon: 'change' },
      { to: '/admin/knowledge-workflows', labelKey: 'admin.knowledgeWorkflows', icon: 'knowledge' },
      { to: '/admin/workflows', labelKey: 'admin.workflows', icon: 'workflow' },
      { to: '/admin/workflows/editor', labelKey: 'admin.workflowEditor', icon: 'workflow' },
    ],
  },
  {
    key: 'cmdb',
    labelKey: 'adminSections.cmdb',
    icon: 'ci',
    items: [
      { to: '/admin/ci-classes', labelKey: 'admin.ciClasses', icon: 'classes' },
    ],
  },
  {
    key: 'data',
    labelKey: 'adminSections.dataIntegration',
    icon: 'data_sources',
    items: [
      { to: '/admin/data-sources', labelKey: 'admin.dataSources', icon: 'data_sources' },
      { to: '/admin/credentials', labelKey: 'admin.credentials', icon: 'credentials' },
      { to: '/admin/config-packages', labelKey: 'admin.configPackages', icon: 'config_packages' },
      { to: '/admin/import', labelKey: 'admin.importData', icon: 'import' },
    ],
  },
  {
    key: 'system',
    labelKey: 'adminSections.system',
    icon: 'settings',
    items: [
      { to: '/admin/system-status', labelKey: 'admin.status', icon: 'status' },
      { to: '/admin/theming', labelKey: 'admin.theming', icon: 'theme' },
    ],
  },
];
