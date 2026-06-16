/* SPDX-License-Identifier: AGPL-3.0-only */

import { AppError } from '../middleware/errorHandler';
import { ensureDataset } from './datasets';
import { getTrendMetric, type TrendMetricDef } from './trendMetrics';

export type TrendInterval = 'day';

export type CompiledTrendQuery = {
  text: string;
  values: unknown[];
  metricDef: TrendMetricDef;
  days: number;
  interval: TrendInterval;
};

function clampDays(raw: unknown): number {
  const days = Number(raw ?? 30);
  if (!Number.isFinite(days)) return 30;
  return Math.max(7, Math.min(Math.trunc(days), 90));
}

export function compileTrendQuery(params: {
  dataset: string;
  metric: string;
  days?: unknown;
  interval?: string;
}): CompiledTrendQuery {
  const dataset = String(params.dataset || '').trim();
  const metric = String(params.metric || '').trim();
  const interval = String(params.interval || 'day').trim() as TrendInterval;
  const days = clampDays(params.days);

  if (interval !== 'day') {
    throw new AppError(400, `Unsupported interval "${interval}"`);
  }

  const metricDef = getTrendMetric(dataset, metric);
  if (!metricDef) {
    throw new AppError(400, `Unsupported trend metric "${dataset}.${metric}"`);
  }

  if (metricDef.kind === 'snapshot') {
    return {
      metricDef,
      days,
      interval,
      text: `SELECT (snapshot_at AT TIME ZONE 'UTC')::date AS day,
                    value::numeric AS value
             FROM metric_snapshots
             WHERE tenant_id = current_tenant_id()
               AND dataset = $1
               AND metric = $2
               AND snapshot_at >= date_trunc('day', now() AT TIME ZONE 'UTC') - ($3::text || ' days')::interval
             ORDER BY 1`,
      values: [dataset, metric, String(days)],
    };
  }

  const spec = ensureDataset(dataset);
  const dateField = String(metricDef.dateField || '').trim();
  const field = spec.fields[dateField];
  if (!field || field.type !== 'timestamp') {
    throw new AppError(500, `Trend metric "${dataset}.${metric}" has invalid date field`);
  }

  return {
    metricDef,
    days,
    interval,
    text: `SELECT (date_trunc('day', ${field.sql} AT TIME ZONE 'UTC'))::date AS day,
                  count(*)::int AS value
           FROM ${spec.table} t
           WHERE t.tenant_id = current_tenant_id()
             AND ${field.sql} >= now() - ($1::text || ' days')::interval
           GROUP BY 1
           ORDER BY 1`,
    values: [String(days)],
  };
}
