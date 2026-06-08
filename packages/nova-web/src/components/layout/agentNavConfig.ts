/* SPDX-License-Identifier: AGPL-3.0-only */

export type NavItemDef = { to: string; label: string; icon: string };
export type RawNavItemDef = { to: string; labelKey: string; icon: string };
export type AdminSection = { key: string; label: string; icon: string; items: NavItemDef[] };
export type RawAdminSection = { key: string; labelKey: string; icon: string; items: RawNavItemDef[] };

export const agentNav = [
  { to: '/', labelKey: 'agent.dashboard', icon: '📊' },
  { to: '/my-todo', labelKey: 'agent.myTodo', icon: '✅' },
  { to: '/my-groups', labelKey: 'agent.myGroups', icon: '👥' },
  { to: '/catalog', labelKey: 'agent.catalog', icon: '📦' },
  { to: '/knowledge', labelKey: 'agent.knowledge', icon: '📚' },
  { to: '/requests', labelKey: 'agent.requests', icon: '📋' },
  { to: '/request-tasks', labelKey: 'agent.requestTasks', icon: '🗂️' },
  { to: '/incidents', labelKey: 'agent.incidents', icon: '🔥' },
  { to: '/major-incidents', labelKey: 'agent.majorIncidents', icon: '🚨' },
  { to: '/problems', labelKey: 'agent.problems', icon: '🧩' },
  { to: '/changes', labelKey: 'agent.changes', icon: '🛠️' },
  { to: '/reports', labelKey: 'agent.reports', icon: '📈' },
  { to: '/cmdb', labelKey: 'agent.cmdb', icon: '🖥️' },
];

export const catalogDesignerNav = [
  { to: '/admin/service-items', labelKey: 'admin.serviceItems', icon: '🎨' },
  { to: '/admin/catalog-tasks', labelKey: 'admin.catalogTasks', icon: '📋' },
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
  const fullWidthPaths = new Set([
    '/incidents',
    '/requests',
    '/changes',
    '/problems',
    '/cmdb',
    '/admin/workflows',
    '/admin/catalog-tasks',
    '/admin/service-items',
    '/admin/data-sources',
  ]);
  return fullWidthPaths.has(pathname);
}

export const adminSections: RawAdminSection[] = [
  {
    key: 'org',
    labelKey: 'adminSections.organization',
    icon: '🏢',
    items: [
      { to: '/admin/users', labelKey: 'admin.users', icon: '👤' },
      { to: '/admin/departments', labelKey: 'admin.departments', icon: '🏢' },
      { to: '/admin/cost-centers', labelKey: 'admin.costCenters', icon: '💰' },
      { to: '/admin/companies', labelKey: 'admin.companies', icon: '🏛️' },
      { to: '/admin/locations', labelKey: 'admin.locations', icon: '📍' },
      { to: '/admin/roles', labelKey: 'admin.roles', icon: '🔑' },
      { to: '/admin/assignment-groups', labelKey: 'admin.assignmentGroups', icon: '👥' },
    ],
  },
  {
    key: 'catalog',
    labelKey: 'adminSections.serviceCatalog',
    icon: '📦',
    items: [
      { to: '/admin/services', labelKey: 'admin.services', icon: '🔧' },
      { to: '/admin/service-items', labelKey: 'admin.serviceItems', icon: '🎨' },
      { to: '/admin/catalog-tasks', labelKey: 'admin.catalogTasks', icon: '📋' },
    ],
  },
  {
    key: 'process',
    labelKey: 'adminSections.processAutomation',
    icon: '⚙️',
    items: [
      { to: '/admin/processes', labelKey: 'admin.processes', icon: '⚙️' },
      { to: '/admin/sla-config', labelKey: 'admin.slaConfiguration', icon: '⏱️' },
      { to: '/admin/notification-config', labelKey: 'admin.notificationWorkflows', icon: '🔔' },
      { to: '/admin/notification-deliveries', labelKey: 'admin.notificationDeliveries', icon: '📨' },
      { to: '/admin/change-management', labelKey: 'admin.changeManagement', icon: '🛠️' },
      { to: '/admin/knowledge-workflows', labelKey: 'admin.knowledgeWorkflows', icon: '📚' },
      { to: '/admin/workflows', labelKey: 'admin.workflows', icon: '🔄' },
      { to: '/admin/workflows/editor', labelKey: 'admin.workflowEditor', icon: '🧩' },
    ],
  },
  {
    key: 'cmdb',
    labelKey: 'adminSections.cmdb',
    icon: '🖥️',
    items: [
      { to: '/admin/ci-classes', labelKey: 'admin.ciClasses', icon: '🏗️' },
    ],
  },
  {
    key: 'data',
    labelKey: 'adminSections.dataIntegration',
    icon: '🔗',
    items: [
      { to: '/admin/data-sources', labelKey: 'admin.dataSources', icon: '🔗' },
      { to: '/admin/credentials', labelKey: 'admin.credentials', icon: '🔐' },
      { to: '/admin/config-packages', labelKey: 'admin.configPackages', icon: '📦' },
      { to: '/admin/import', labelKey: 'admin.importData', icon: '📥' },
    ],
  },
  {
    key: 'system',
    labelKey: 'adminSections.system',
    icon: '🛠️',
    items: [
      { to: '/admin/system-status', labelKey: 'admin.status', icon: '🟢' },
      { to: '/admin/theming', labelKey: 'admin.theming', icon: '🎨' },
    ],
  },
];
