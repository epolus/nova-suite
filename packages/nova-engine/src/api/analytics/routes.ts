/* SPDX-License-Identifier: AGPL-3.0-only */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, getRequestClient, releaseTenantClient, setTenantRLS } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { hasAnyRole } from '../roles';
import { fillDailyGaps } from '../../analytics/fillDailyGaps';
import { compileTrendQuery } from '../../analytics/compileTrendQuery';
import { isReportDatasetKey } from '../../analytics/datasets';
import { listTrendMetricsForRoles, getTrendMetric } from '../../analytics/trendMetrics';

const router = Router();

router.use(authenticate, setTenantRLS, releaseTenantClient);

function canUseTrendMetric(req: Request, dataset: string, metric: string): boolean {
  const def = getTrendMetric(dataset, metric);
  if (!def) return false;
  if (!def.requiredRoles || def.requiredRoles.length === 0) return true;
  return hasAnyRole(req, def.requiredRoles);
}

router.get('/trends/catalog', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roles = Array.isArray(req.user?.roles) ? req.user!.roles as string[] : [];
    const metrics = listTrendMetricsForRoles(roles).map((def) => ({
      dataset: def.dataset,
      metric: def.metric,
      kind: def.kind,
      labelKey: def.labelKey,
      defaultDays: def.defaultDays ?? 30,
      intervals: ['day'],
    }));
    res.json({ metrics });
  } catch (err) {
    next(err);
  }
});

router.get('/trends', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dataset = String(req.query.dataset || '').trim();
    const metric = String(req.query.metric || '').trim();

    if (!isReportDatasetKey(dataset)) {
      throw new AppError(400, `Unsupported dataset "${dataset}"`);
    }
    if (!canUseTrendMetric(req, dataset, metric)) {
      throw new AppError(403, 'You do not have access to this trend metric');
    }

    const compiled = compileTrendQuery({
      dataset,
      metric,
      days: req.query.days,
      interval: typeof req.query.interval === 'string' ? req.query.interval : undefined,
    });

    const client = getRequestClient(req);
    const result = await client.query(compiled.text, compiled.values);
    const rawPoints = result.rows.map((row: { day: Date | string; value: number | string }) => ({
      date: row.day instanceof Date
        ? row.day.toISOString().slice(0, 10)
        : String(row.day).slice(0, 10),
      value: Number(row.value) || 0,
    }));

    const points = fillDailyGaps(rawPoints, compiled.days);
    const total = compiled.metricDef.kind === 'snapshot'
      ? (points.length > 0 ? points[points.length - 1]!.value : 0)
      : points.reduce((sum, point) => sum + point.value, 0);

    res.json({
      dataset,
      metric,
      kind: compiled.metricDef.kind,
      days: compiled.days,
      interval: compiled.interval,
      points,
      meta: { total },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
