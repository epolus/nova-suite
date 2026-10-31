/* SPDX-License-Identifier: AGPL-3.0-only */
import { ChartColumn, ChartPie, Gauge, Table2, type LucideIcon } from 'lucide-react';
import type { ReportComponentType } from '@/api/types/reports';

const REPORT_TYPE_ICONS: Record<ReportComponentType, LucideIcon> = {
  table: Table2,
  kpi: Gauge,
  bar_chart: ChartColumn,
  pie_chart: ChartPie,
};

export function ReportTypeIcon({
  type,
  className = 'size-4',
}: {
  type: ReportComponentType;
  className?: string;
}) {
  const Icon = REPORT_TYPE_ICONS[type];
  return <Icon className={className} aria-hidden="true" />;
}
