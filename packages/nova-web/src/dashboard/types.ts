/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ComponentType, LazyExoticComponent } from 'react';

export type DashboardWidgetCategory = 'stats' | 'lists' | 'alerts' | 'breakdown' | 'trends';

export type DashboardWidgetType =
  | 'stat.open_incidents'
  | 'stat.sla_breached'
  | 'stat.open_changes'
  | 'stat.open_requests'
  | 'stat.assigned_to_me'
  | 'alert.major_incidents'
  | 'breakdown.incident_priority'
  | 'list.my_queue'
  | 'list.changes_pending'
  | 'list.recent_requests'
  | 'trend.chart';

export interface DashboardWidgetInstance {
  id: string;
  type: DashboardWidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: Record<string, unknown>;
}

export interface DashboardLayout {
  version: 1;
  widgets: DashboardWidgetInstance[];
}

export interface DashboardWidgetProps {
  instance: DashboardWidgetInstance;
  editMode?: boolean;
  onConfigChange?: (config: Record<string, unknown>) => void;
}

export type DashboardStatAccent = 'indigo' | 'red' | 'violet' | 'blue' | 'emerald';

export interface DashboardWidgetDefinition {
  type: DashboardWidgetType;
  /** Unique catalog id when multiple presets share the same type. */
  catalogKey?: string;
  titleKey: string;
  category: DashboardWidgetCategory;
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
  defaultSize: { w: number; h: number };
  defaultConfig?: Record<string, unknown>;
  requiredRoles?: string[];
  viewAllLink?: string;
  statAccent?: DashboardStatAccent;
  component: LazyExoticComponent<ComponentType<DashboardWidgetProps>>;
}

export interface DashboardWidgetCatalogEntry {
  catalogKey: string;
  type: DashboardWidgetType;
  titleKey: string;
  category: DashboardWidgetCategory;
  defaultSize: { w: number; h: number };
  defaultConfig?: Record<string, unknown>;
  requiredRoles?: string[];
}

export interface ListWidgetConfig {
  limit?: number;
}

export const LIST_LIMIT_OPTIONS = [5, 10, 20] as const;
export const DEFAULT_LIST_LIMIT = 5;
