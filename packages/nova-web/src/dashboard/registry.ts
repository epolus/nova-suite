/* SPDX-License-Identifier: AGPL-3.0-only */
import { lazy } from 'react';
import { hasAnyRole } from '@/utils/roles';
import type { DashboardWidgetCatalogEntry, DashboardWidgetDefinition, DashboardWidgetType } from './types';

/**
 * Dashboard widget registry.
 *
 * To add a new widget:
 * 1. Create a component under `widgets/` implementing `DashboardWidgetProps`
 * 2. Register it here with grid constraints and optional `requiredRoles`
 * 3. Add i18n keys under `pages.dashboard.customize.widgets.{type}`
 * 4. Optionally add it to `defaults.ts` for role-based default layouts
 */
const WIDGET_DEFINITIONS: DashboardWidgetDefinition[] = [
  {
    type: 'stat.open_incidents',
    titleKey: 'widgets.stat.open_incidents',
    category: 'stats',
    minW: 2, maxW: 6, minH: 2, maxH: 3,
    defaultSize: { w: 3, h: 2 },
    requiredRoles: ['admin', 'fulfiller'],
    statAccent: 'indigo',
    component: lazy(() => import('./widgets/IncidentStatWidgets')),
  },
  {
    type: 'stat.sla_breached',
    titleKey: 'widgets.stat.sla_breached',
    category: 'stats',
    minW: 2, maxW: 6, minH: 2, maxH: 3,
    defaultSize: { w: 3, h: 2 },
    requiredRoles: ['admin', 'fulfiller'],
    statAccent: 'red',
    component: lazy(() => import('./widgets/IncidentStatWidgets').then((m) => ({ default: m.SlaBreachedStatWidget }))),
  },
  {
    type: 'stat.assigned_to_me',
    titleKey: 'widgets.stat.assigned_to_me',
    category: 'stats',
    minW: 2, maxW: 6, minH: 2, maxH: 3,
    defaultSize: { w: 3, h: 2 },
    requiredRoles: ['admin', 'fulfiller'],
    statAccent: 'emerald',
    component: lazy(() => import('./widgets/IncidentStatWidgets').then((m) => ({ default: m.AssignedToMeStatWidget }))),
  },
  {
    type: 'stat.open_changes',
    titleKey: 'widgets.stat.open_changes',
    category: 'stats',
    minW: 2, maxW: 6, minH: 2, maxH: 3,
    defaultSize: { w: 3, h: 2 },
    requiredRoles: ['admin', 'fulfiller', 'change_manager'],
    statAccent: 'violet',
    component: lazy(() => import('./widgets/ChangeStatWidgets')),
  },
  {
    type: 'stat.open_requests',
    titleKey: 'widgets.stat.open_requests',
    category: 'stats',
    minW: 2, maxW: 6, minH: 2, maxH: 3,
    defaultSize: { w: 3, h: 2 },
    statAccent: 'blue',
    component: lazy(() => import('./widgets/RequestStatWidgets')),
  },
  {
    type: 'alert.major_incidents',
    titleKey: 'widgets.alert.major_incidents',
    category: 'alerts',
    minW: 4, maxW: 12, minH: 2, maxH: 6,
    defaultSize: { w: 12, h: 2 },
    requiredRoles: ['admin', 'fulfiller'],
    viewAllLink: '/major-incidents',
    component: lazy(() => import('./widgets/MajorIncidentsWidget')),
  },
  {
    type: 'breakdown.incident_priority',
    titleKey: 'widgets.breakdown.incident_priority',
    category: 'breakdown',
    minW: 4, maxW: 12, minH: 2, maxH: 4,
    defaultSize: { w: 12, h: 2 },
    requiredRoles: ['admin', 'fulfiller'],
    component: lazy(() => import('./widgets/IncidentPriorityWidget')),
  },
  {
    type: 'list.my_queue',
    titleKey: 'widgets.list.my_queue',
    category: 'lists',
    minW: 4, maxW: 12, minH: 4, maxH: 12,
    defaultSize: { w: 6, h: 6 },
    requiredRoles: ['admin', 'fulfiller'],
    viewAllLink: '/incidents?assigned_to_me=true',
    component: lazy(() => import('./widgets/MyQueueWidget')),
  },
  {
    type: 'list.changes_pending',
    titleKey: 'widgets.list.changes_pending',
    category: 'lists',
    minW: 4, maxW: 12, minH: 4, maxH: 12,
    defaultSize: { w: 6, h: 6 },
    requiredRoles: ['admin', 'fulfiller', 'change_manager'],
    viewAllLink: '/changes?status=pending_approval',
    component: lazy(() => import('./widgets/ChangesPendingWidget')),
  },
  {
    type: 'list.recent_requests',
    titleKey: 'widgets.list.recent_requests',
    category: 'lists',
    minW: 4, maxW: 12, minH: 4, maxH: 12,
    defaultSize: { w: 6, h: 6 },
    viewAllLink: '/requests?active=true',
    component: lazy(() => import('./widgets/RecentRequestsWidget')),
  },
  {
    type: 'trend.chart',
    titleKey: 'widgets.trend.chart',
    category: 'trends',
    minW: 4, maxW: 12, minH: 3, maxH: 8,
    defaultSize: { w: 6, h: 4 },
    requiredRoles: ['admin', 'fulfiller'],
    component: lazy(() => import('./widgets/TrendChartWidget')),
  },
];

const TREND_CATALOG_PRESETS: DashboardWidgetCatalogEntry[] = [
  {
    catalogKey: 'trend.incidents_opened',
    type: 'trend.chart',
    titleKey: 'widgets.trend.incidents_opened',
    category: 'trends',
    defaultSize: { w: 6, h: 4 },
    defaultConfig: { dataset: 'incidents', metric: 'opened', days: 30 },
    requiredRoles: ['admin', 'fulfiller'],
  },
  {
    catalogKey: 'trend.changes_opened',
    type: 'trend.chart',
    titleKey: 'widgets.trend.changes_opened',
    category: 'trends',
    defaultSize: { w: 6, h: 4 },
    defaultConfig: { dataset: 'changes', metric: 'opened', days: 30 },
    requiredRoles: ['admin', 'fulfiller', 'change_manager'],
  },
  {
    catalogKey: 'trend.requests_opened',
    type: 'trend.chart',
    titleKey: 'widgets.trend.requests_opened',
    category: 'trends',
    defaultSize: { w: 6, h: 4 },
    defaultConfig: { dataset: 'requests', metric: 'opened', days: 30 },
  },
  {
    catalogKey: 'trend.incidents_open_backlog',
    type: 'trend.chart',
    titleKey: 'widgets.trend.incidents_open_backlog',
    category: 'trends',
    defaultSize: { w: 6, h: 4 },
    defaultConfig: { dataset: 'incidents', metric: 'open_backlog', days: 30 },
    requiredRoles: ['admin', 'fulfiller'],
  },
  {
    catalogKey: 'trend.changes_open_backlog',
    type: 'trend.chart',
    titleKey: 'widgets.trend.changes_open_backlog',
    category: 'trends',
    defaultSize: { w: 6, h: 4 },
    defaultConfig: { dataset: 'changes', metric: 'open_backlog', days: 30 },
    requiredRoles: ['admin', 'fulfiller', 'change_manager'],
  },
  {
    catalogKey: 'trend.requests_open_backlog',
    type: 'trend.chart',
    titleKey: 'widgets.trend.requests_open_backlog',
    category: 'trends',
    defaultSize: { w: 6, h: 4 },
    defaultConfig: { dataset: 'requests', metric: 'open_backlog', days: 30 },
  },
];

const REGISTRY_MAP = new Map<DashboardWidgetType, DashboardWidgetDefinition>(
  WIDGET_DEFINITIONS.map((def) => [def.type, def]),
);

export function getWidgetDefinition(type: DashboardWidgetType): DashboardWidgetDefinition | undefined {
  return REGISTRY_MAP.get(type);
}

export function isKnownWidgetType(type: string): type is DashboardWidgetType {
  return REGISTRY_MAP.has(type as DashboardWidgetType);
}

export function getAllWidgetDefinitions(): DashboardWidgetDefinition[] {
  return WIDGET_DEFINITIONS;
}

export function getAvailableWidgets(roles: string[] | undefined): DashboardWidgetDefinition[] {
  return WIDGET_DEFINITIONS.filter((def) => {
    if (!def.requiredRoles || def.requiredRoles.length === 0) return true;
    return hasAnyRole(roles, def.requiredRoles);
  });
}

export function getWidgetsByCategory(
  roles: string[] | undefined,
): Record<DashboardWidgetDefinition['category'], DashboardWidgetDefinition[]> {
  const available = getAvailableWidgets(roles);
  return {
    stats: available.filter((w) => w.category === 'stats'),
    lists: available.filter((w) => w.category === 'lists'),
    alerts: available.filter((w) => w.category === 'alerts'),
    breakdown: available.filter((w) => w.category === 'breakdown'),
    trends: available.filter((w) => w.category === 'trends'),
  };
}

function canAccessCatalogEntry(entry: DashboardWidgetCatalogEntry, roles: string[] | undefined): boolean {
  if (!entry.requiredRoles || entry.requiredRoles.length === 0) return true;
  return hasAnyRole(roles, entry.requiredRoles);
}

export function getWidgetCatalogEntries(roles: string[] | undefined): DashboardWidgetCatalogEntry[] {
  const baseEntries: DashboardWidgetCatalogEntry[] = WIDGET_DEFINITIONS
    .filter((def) => def.category !== 'trends')
    .map((def) => ({
      catalogKey: def.catalogKey ?? def.type,
      type: def.type,
      titleKey: def.titleKey,
      category: def.category,
      defaultSize: def.defaultSize,
      defaultConfig: def.defaultConfig,
      requiredRoles: def.requiredRoles,
    }));

  const trendEntries = TREND_CATALOG_PRESETS.filter((entry) => canAccessCatalogEntry(entry, roles));
  return [...baseEntries, ...trendEntries].filter((entry) => canAccessCatalogEntry(entry, roles));
}

export function getCatalogEntry(catalogKey: string): DashboardWidgetCatalogEntry | undefined {
  const fromPreset = TREND_CATALOG_PRESETS.find((entry) => entry.catalogKey === catalogKey);
  if (fromPreset) return fromPreset;
  const def = WIDGET_DEFINITIONS.find((item) => (item.catalogKey ?? item.type) === catalogKey);
  if (!def) return undefined;
  return {
    catalogKey: def.catalogKey ?? def.type,
    type: def.type,
    titleKey: def.titleKey,
    category: def.category,
    defaultSize: def.defaultSize,
    defaultConfig: def.defaultConfig,
    requiredRoles: def.requiredRoles,
  };
}
