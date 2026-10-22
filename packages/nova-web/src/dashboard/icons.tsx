/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  ClipboardList,
  Clock,
  GripVertical,
  RefreshCw,
  Settings,
  TriangleAlert,
  User,
  type LucideIcon,
} from 'lucide-react';

function dashboardIcon(Icon: LucideIcon, defaultClassName: string) {
  return function DashboardIcon({ className = defaultClassName }: { className?: string }) {
    return <Icon className={className} aria-hidden="true" />;
  };
}

export const DashboardIcons = {
  incident: dashboardIcon(TriangleAlert, 'size-5'),
  sla: dashboardIcon(Clock, 'size-5'),
  change: dashboardIcon(RefreshCw, 'size-5'),
  request: dashboardIcon(ClipboardList, 'size-5'),
  queue: dashboardIcon(User, 'size-5'),
  grip: dashboardIcon(GripVertical, 'size-4'),
  settings: dashboardIcon(Settings, 'size-5'),
};
