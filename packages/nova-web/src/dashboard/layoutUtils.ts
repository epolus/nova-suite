/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Layout, LayoutItem } from 'react-grid-layout';
import { hasAnyRole } from '@/utils/roles';
import { MAX_DASHBOARD_WIDGETS } from './constants';
import { getWidgetDefinition, isKnownWidgetType } from './registry';
import type { DashboardLayout, DashboardWidgetInstance, DashboardWidgetType } from './types';

export function createWidgetId(): string {
  return crypto.randomUUID();
}

export function defaultWidgetId(type: DashboardWidgetType): string {
  return `def-${type.replace(/\./g, '-')}`;
}

export function canAccessWidget(type: DashboardWidgetType, roles: string[] | undefined): boolean {
  const def = getWidgetDefinition(type);
  if (!def) return false;
  if (!def.requiredRoles || def.requiredRoles.length === 0) return true;
  return hasAnyRole(roles, def.requiredRoles);
}

export function clampWidgetSize(
  type: DashboardWidgetType,
  w: number,
  h: number,
): { w: number; h: number } {
  const def = getWidgetDefinition(type);
  if (!def) return { w, h };
  return {
    w: Math.min(def.maxW, Math.max(def.minW, w)),
    h: Math.min(def.maxH, Math.max(def.minH, h)),
  };
}

export function sanitizeDashboardLayout(
  layout: DashboardLayout,
  roles: string[] | undefined,
): DashboardLayout {
  if (!layout || layout.version !== 1 || !Array.isArray(layout.widgets)) {
    return { version: 1, widgets: [] };
  }

  const seen = new Set<string>();
  const widgets: DashboardWidgetInstance[] = [];

  for (const item of layout.widgets.slice(0, MAX_DASHBOARD_WIDGETS)) {
    if (!item || typeof item.id !== 'string' || !isKnownWidgetType(item.type)) continue;
    if (!canAccessWidget(item.type, roles)) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);

    const size = clampWidgetSize(item.type, item.w, item.h);
    widgets.push({
      id: item.id,
      type: item.type,
      x: Math.max(0, Math.floor(item.x)),
      y: Math.max(0, Math.floor(item.y)),
      w: size.w,
      h: size.h,
      config: item.config && typeof item.config === 'object' ? item.config : undefined,
    });
  }

  return { version: 1, widgets: repairOverlappingWidgets(widgets) };
}

function widgetsOverlap(a: DashboardWidgetInstance, b: DashboardWidgetInstance): boolean {
  if (a.id === b.id) return false;
  return (
    a.x < b.x + b.w
    && a.x + a.w > b.x
    && a.y < b.y + b.h
    && a.y + a.h > b.y
  );
}

function repairOverlappingWidgets(widgets: DashboardWidgetInstance[]): DashboardWidgetInstance[] {
  if (widgets.length <= 1) return widgets;

  const hasOverlap = widgets.some((widget, index) =>
    widgets.some((other, otherIndex) => otherIndex !== index && widgetsOverlap(widget, other)),
  );
  if (!hasOverlap) return widgets;

  const sorted = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: DashboardWidgetInstance[] = [];

  for (const widget of sorted) {
    let candidate = { ...widget };
    let guard = 0;
    while (placed.some((other) => widgetsOverlap(candidate, other)) && guard < 200) {
      candidate = { ...candidate, y: candidate.y + 1 };
      guard++;
    }
    placed.push(candidate);
  }

  return placed;
}

export function toGridLayout(widgets: DashboardWidgetInstance[]): Layout {
  return widgets.map((widget) => {
    const def = getWidgetDefinition(widget.type);
    const size = clampWidgetSize(widget.type, widget.w, widget.h);
    return {
      i: widget.id,
      x: widget.x,
      y: widget.y,
      w: size.w,
      h: size.h,
      minW: def?.minW,
      minH: def?.minH,
      maxW: def?.maxW,
      maxH: def?.maxH,
    } satisfies LayoutItem;
  });
}

export function applyGridLayout(
  layout: DashboardLayout,
  grid: Layout,
): DashboardLayout {
  const byId = new Map(grid.map((item) => [item.i, item]));
  return {
    version: 1,
    widgets: layout.widgets.map((widget) => {
      const gridItem = byId.get(widget.id);
      if (!gridItem) return widget;
      const size = clampWidgetSize(widget.type, gridItem.w, gridItem.h);
      return {
        ...widget,
        x: gridItem.x,
        y: gridItem.y,
        w: size.w,
        h: size.h,
      };
    }),
  };
}

export function findNextPlacement(
  widgets: DashboardWidgetInstance[],
  _w: number,
  _h: number,
): { x: number; y: number } {
  const maxY = widgets.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  return { x: 0, y: maxY };
}

export function createWidgetInstance(
  type: DashboardWidgetType,
  existing: DashboardWidgetInstance[],
): DashboardWidgetInstance | null {
  const def = getWidgetDefinition(type);
  if (!def) return null;
  const { x, y } = findNextPlacement(existing, def.defaultSize.w, def.defaultSize.h);
  return {
    id: createWidgetId(),
    type,
    x,
    y,
    w: def.defaultSize.w,
    h: def.defaultSize.h,
  };
}

export function updateWidgetConfig(
  layout: DashboardLayout,
  widgetId: string,
  config: Record<string, unknown>,
): DashboardLayout {
  return {
    version: 1,
    widgets: layout.widgets.map((widget) =>
      widget.id === widgetId ? { ...widget, config: { ...widget.config, ...config } } : widget,
    ),
  };
}

export function removeWidget(layout: DashboardLayout, widgetId: string): DashboardLayout {
  return {
    version: 1,
    widgets: layout.widgets.filter((widget) => widget.id !== widgetId),
  };
}
