/* SPDX-License-Identifier: AGPL-3.0-only */
import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'nova_engine_' });

const httpRequestsTotal = new client.Counter({
  name: 'nova_engine_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

const httpRequestDuration = new client.Histogram({
  name: 'nova_engine_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.01, 0.05, 0.1, 0.3, 0.8, 1.5, 3, 6],
  registers: [registry],
});

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
    const route = req.route?.path ? `${req.baseUrl || ''}${String(req.route.path)}` : req.path;
    const labels = {
      method: req.method.toUpperCase(),
      route: route || 'unknown',
      status_code: String(res.statusCode),
    };
    httpRequestsTotal.inc(labels, 1);
    httpRequestDuration.observe(labels, durationSeconds);
  });
  next();
}

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.setHeader('Content-Type', registry.contentType);
  res.end(await registry.metrics());
}
