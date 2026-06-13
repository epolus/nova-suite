/* SPDX-License-Identifier: AGPL-3.0-only */
import { hasChangeRole, isFulfillerRole } from '@/utils/roles';
import { defaultWidgetId } from './layoutUtils';
import type { DashboardLayout, DashboardWidgetInstance } from './types';

function widget(
  type: DashboardWidgetInstance['type'],
  x: number,
  y: number,
  w: number,
  h: number,
): DashboardWidgetInstance {
  return { id: defaultWidgetId(type), type, x, y, w, h };
}

export function buildDefaultDashboardLayout(roles: string[] | undefined): DashboardLayout {
  const widgets: DashboardWidgetInstance[] = [];
  const fulfiller = isFulfillerRole(roles);
  const changeManager = hasChangeRole(roles);

  let y = 0;

  if (fulfiller) {
    widgets.push(
      widget('stat.open_incidents', 0, y, 3, 2),
      widget('stat.sla_breached', 3, y, 3, 2),
    );
    if (changeManager) {
      widgets.push(widget('stat.open_changes', 6, y, 3, 2));
    }
    widgets.push(widget('stat.open_requests', changeManager ? 9 : 6, y, 3, 2));
    y += 2;
    widgets.push(widget('stat.assigned_to_me', 0, y, 3, 2));
    y += 2;
  } else if (changeManager) {
    widgets.push(
      widget('stat.open_changes', 0, y, 3, 2),
      widget('stat.open_requests', 3, y, 3, 2),
    );
    y += 2;
  } else {
    widgets.push(widget('stat.open_requests', 0, y, 3, 2));
    y += 2;
  }

  if (fulfiller) {
    widgets.push(widget('alert.major_incidents', 0, y, 12, 2));
    y += 2;
    widgets.push(widget('breakdown.incident_priority', 0, y, 12, 2));
    y += 2;
  }

  const listHeight = 6;
  if (fulfiller) {
    widgets.push(widget('list.my_queue', 0, y, 6, listHeight));
    widgets.push(widget('list.recent_requests', 6, y, 6, listHeight));
    y += listHeight;
  } else {
    widgets.push(widget('list.recent_requests', 0, y, 12, listHeight));
    y += listHeight;
  }

  if (changeManager) {
    widgets.push(widget('list.changes_pending', 0, y, fulfiller ? 6 : 12, listHeight));
  }

  return { version: 1, widgets };
}
