/* SPDX-License-Identifier: AGPL-3.0-only */

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

const TREND_METRICS: TrendMetricDef[] = [
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
  {
    dataset: 'incidents',
    metric: 'open_backlog',
    kind: 'snapshot',
    countSql: `SELECT count(*)::int AS value FROM incidents WHERE status NOT IN ('closed','cancelled')`,
    requiredRoles: ['admin', 'fulfiller'],
    defaultDays: 30,
    labelKey: 'incidents.open_backlog',
  },
  {
    dataset: 'changes',
    metric: 'open_backlog',
    kind: 'snapshot',
    countSql: `SELECT count(*)::int AS value FROM changes WHERE status NOT IN ('closed','cancelled','rejected')`,
    requiredRoles: ['admin', 'fulfiller', 'change_manager'],
    defaultDays: 30,
    labelKey: 'changes.open_backlog',
  },
  {
    dataset: 'requests',
    metric: 'open_backlog',
    kind: 'snapshot',
    countSql: `SELECT count(*)::int AS value FROM requests WHERE status NOT IN ('fulfilled','cancelled')`,
    defaultDays: 30,
    labelKey: 'requests.open_backlog',
  },
];

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
