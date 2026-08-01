/* SPDX-License-Identifier: AGPL-3.0-only */

import { SNAPSHOT_TREND_METRICS } from '@nova-suite/shared';
import type { ReportDatasetKey } from './datasets';

export type TrendMetricKind = 'count_by_date' | 'snapshot';

export type TrendMetricDef = {
  dataset: ReportDatasetKey;
  metric: string;
  kind: TrendMetricKind;
  dateField?: string;
  countSql?: string;
  requiredRoles?: string[];
  defaultDays?: number;
  labelKey: string;
};

const SNAPSHOT_META: Record<string, Pick<TrendMetricDef, 'requiredRoles' | 'labelKey'>> = {
  'incidents:open_backlog': { requiredRoles: ['admin', 'fulfiller'], labelKey: 'incidents.open_backlog' },
  'changes:open_backlog': { requiredRoles: ['admin', 'fulfiller', 'change_manager'], labelKey: 'changes.open_backlog' },
  'requests:open_backlog': { labelKey: 'requests.open_backlog' },
  'problems:open_backlog': { requiredRoles: ['admin', 'fulfiller'], labelKey: 'problems.open_backlog' },
};

const COUNT_BY_DATE_METRICS: TrendMetricDef[] = [
  {
    dataset: 'incidents',
    metric: 'opened',
    kind: 'count_by_date',
    dateField: 'created_at',
    requiredRoles: ['admin', 'fulfiller'],
    defaultDays: 30,
    labelKey: 'incidents.opened',
  },
  {
    dataset: 'incidents',
    metric: 'resolved',
    kind: 'count_by_date',
    dateField: 'resolved_at',
    requiredRoles: ['admin', 'fulfiller'],
    defaultDays: 30,
    labelKey: 'incidents.resolved',
  },
  {
    dataset: 'changes',
    metric: 'opened',
    kind: 'count_by_date',
    dateField: 'created_at',
    requiredRoles: ['admin', 'fulfiller', 'change_manager'],
    defaultDays: 30,
    labelKey: 'changes.opened',
  },
  {
    dataset: 'requests',
    metric: 'opened',
    kind: 'count_by_date',
    dateField: 'created_at',
    defaultDays: 30,
    labelKey: 'requests.opened',
  },
];

const SNAPSHOT_METRICS: TrendMetricDef[] = SNAPSHOT_TREND_METRICS.map((entry) => {
  const meta = SNAPSHOT_META[`${entry.dataset}:${entry.metric}`] ?? { labelKey: `${entry.dataset}.${entry.metric}` };
  return {
    dataset: entry.dataset as ReportDatasetKey,
    metric: entry.metric,
    kind: 'snapshot' as const,
    countSql: entry.countSql,
    defaultDays: 30,
    ...meta,
  };
});

const TREND_METRICS: TrendMetricDef[] = [...COUNT_BY_DATE_METRICS, ...SNAPSHOT_METRICS];

function metricKey(dataset: string, metric: string): string {
  return `${dataset}:${metric}`;
}

const METRIC_MAP = new Map(
  TREND_METRICS.map((def) => [metricKey(def.dataset, def.metric), def]),
);

export function getTrendMetric(dataset: string, metric: string): TrendMetricDef | undefined {
  return METRIC_MAP.get(metricKey(dataset, metric));
}

export function listTrendMetrics(): TrendMetricDef[] {
  return [...TREND_METRICS];
}

export function listTrendMetricsForRoles(roles: string[]): TrendMetricDef[] {
  const normalized = roles.map((role) => role.trim().toLowerCase());
  return TREND_METRICS.filter((def) => {
    if (!def.requiredRoles || def.requiredRoles.length === 0) return true;
    return def.requiredRoles.some((role) => normalized.includes(role.toLowerCase()));
  });
}

export function listSnapshotTrendMetrics(): TrendMetricDef[] {
  return TREND_METRICS.filter((def) => def.kind === 'snapshot' && def.countSql);
}
