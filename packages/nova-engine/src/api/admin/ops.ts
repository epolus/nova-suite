/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Admin: Audit events, runtime health, system metrics ───

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../data/db';
import { config } from '../../config';
import { checkTemporalHealth } from '../../temporal/workflows';
import { getWorkflowStartQueueStats } from '../../temporal/workflow-start-queue';
import { cacheMetrics } from '../../cache/redis';
import { SystemMetricsResponse, statusFromThresholds, maxStatus } from './system-metrics';

const router = Router();

const processStartedAtMs = Date.now();

router.get('/audit-events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const limitRaw = Number.parseInt(String(req.query.limit || '100'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 500)) : 100;
    const rows = await db.getMany(
      `SELECT ae.id, ae.category, ae.action, ae.level, ae.entity_type, ae.entity_id,
              ae.metadata, ae.metadata->>'ip_address' AS ip_address,
              ae.created_at, ae.actor_user_id, u.display_name AS actor_name
       FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.actor_user_id
       WHERE ae.tenant_id = $1
       ORDER BY ae.created_at DESC
       LIMIT $2`,
      [tenantId, limit],
    );
    res.json({ events: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/runtime-health', async (_req: Request, res: Response) => {
  const dbOk = await db.healthCheck();
  const schema = await db.checkSchemaCompatibility(config.db.expectedSchemaVersion);
  const redis = cacheMetrics() as { connected?: boolean; enabled?: boolean };
  const temporalOk = await checkTemporalHealth(2000);
  const queueStats = await getWorkflowStartQueueStats().catch(() => ({ pending: 0, failed: 0 }));
  const workerHeartbeat = await db.getOne<{ last_seen_at: string | null }>(
    'SELECT max(last_seen_at) AS last_seen_at FROM worker_heartbeats',
  ).catch(() => ({ last_seen_at: null }));
  const lastSeenAt = workerHeartbeat?.last_seen_at ? new Date(workerHeartbeat.last_seen_at).getTime() : null;
  const workerRecent = lastSeenAt !== null && Date.now() - lastSeenAt < 120_000;
  const status = dbOk && temporalOk && workerRecent && schema.ok ? 'healthy' : 'degraded';

  // Always return 200 for admin UI to avoid noisy browser fetch errors;
  // operational probes should continue using /health which returns 503 when degraded.
  res.json({
    status,
    version: '0.1.6',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbOk ? 'connected' : 'disconnected',
      schema: schema.ok ? 'compatible' : 'mismatch',
      schema_expected_version: schema.expectedVersion,
      schema_actual_version: schema.actualVersion,
      schema_reason: schema.reason,
      redis: redis.enabled ? (redis.connected ? 'connected' : 'disconnected') : 'disabled',
      temporal: temporalOk ? 'connected' : 'disconnected',
      worker: workerRecent ? 'alive' : 'stale',
      workflow_start_queue_pending: queueStats.pending,
      workflow_start_queue_failed: queueStats.failed,
    },
  });
});

router.get('/system-metrics', async (req: Request, res: Response) => {
  const nowIso = new Date().toISOString();
  const tenantId = req.user!.tenant_id;
  const dbOk = await db.healthCheck();
  const schema = await db.checkSchemaCompatibility(config.db.expectedSchemaVersion);
  const redis = cacheMetrics() as { connected?: boolean; enabled?: boolean };
  const temporalOk = await checkTemporalHealth(2000);
  const queueStats = await getWorkflowStartQueueStats().catch(() => ({ pending: 0, failed: 0 }));
  const workerHeartbeat = await db.getOne<{ last_seen_at: string | null }>(
    'SELECT max(last_seen_at) AS last_seen_at FROM worker_heartbeats',
  ).catch(() => ({ last_seen_at: null }));
  const lastSeenAt = workerHeartbeat?.last_seen_at ? new Date(workerHeartbeat.last_seen_at).getTime() : null;
  const workerRecent = lastSeenAt !== null && Date.now() - lastSeenAt < 120_000;
  const appStatus: 'healthy' | 'degraded' = dbOk && temporalOk && workerRecent && schema.ok ? 'healthy' : 'degraded';

  const dbSize = await db.getOne<{ total_bytes: string }>(
    'SELECT pg_database_size(current_database())::bigint::text AS total_bytes',
  ).catch(() => null);
  const apiWindowMinutes = 30;

  const tenantScoped = await db.withTenantTransaction(
    tenantId,
    req.user!.id,
    req.user!.roles.join(','),
    async (client) => {
      const baseline24hRes = await client.query<{ total_bytes: string }>(
        `SELECT total_bytes::text AS total_bytes
         FROM system_metrics_db_size_snapshots
         WHERE tenant_id = $1
           AND snapshot_at <= now() - interval '24 hours'
         ORDER BY snapshot_at DESC
         LIMIT 1`,
        [tenantId],
      );
      const baseline7dRes = await client.query<{ total_bytes: string }>(
        `SELECT total_bytes::text AS total_bytes
         FROM system_metrics_db_size_snapshots
         WHERE tenant_id = $1
           AND snapshot_at <= now() - interval '7 days'
         ORDER BY snapshot_at DESC
         LIMIT 1`,
        [tenantId],
      );
      const auditApiRes = await client.query<{
        p50_ms: string | null;
        p95_ms: string | null;
        p99_ms: string | null;
        rpm: string | null;
        error_rate_5xx_pct: string | null;
        error_rate_4xx_pct: string | null;
      }>(
        `WITH scoped AS (
           SELECT
             nullif(ae.metadata->>'duration_ms', '')::double precision AS duration_ms,
             nullif(ae.metadata->>'status', '')::int AS status_code,
             ae.created_at
           FROM audit_events ae
           WHERE ae.tenant_id = $1::uuid
             AND ae.created_at >= (now() - interval '${apiWindowMinutes} minutes')
             AND ae.metadata ? 'duration_ms'
         )
         SELECT
           percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)::text AS p50_ms,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::text AS p95_ms,
           percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms)::text AS p99_ms,
           (count(*) / ${apiWindowMinutes}.0)::text AS rpm,
           (100.0 * count(*) FILTER (WHERE status_code >= 500) / nullif(count(*), 0))::text AS error_rate_5xx_pct,
           (100.0 * count(*) FILTER (WHERE status_code BETWEEN 400 AND 499) / nullif(count(*), 0))::text AS error_rate_4xx_pct
         FROM scoped`,
        [tenantId],
      );
      const failedJobsRes = await client.query<{ failed_jobs: string }>(
        `SELECT count(*)::text AS failed_jobs
         FROM workflow_start_jobs
         WHERE tenant_id = $1
           AND status = 'failed'
           AND updated_at >= now() - interval '24 hours'`,
        [tenantId],
      );
      const oldestQueuedRes = await client.query<{ oldest_age_sec: string | null }>(
        `SELECT EXTRACT(EPOCH FROM (now() - min(created_at)))::text AS oldest_age_sec
         FROM workflow_start_jobs
         WHERE tenant_id = $1 AND status = 'pending'`,
        [tenantId],
      );
      return {
        baseline24h: baseline24hRes.rows[0] || null,
        baseline7d: baseline7dRes.rows[0] || null,
        auditApi: auditApiRes.rows[0] || null,
        failed24h: failedJobsRes.rows[0] || null,
        oldestQueued: oldestQueuedRes.rows[0] || null,
      };
    },
  ).catch(() => null);

  const baseline24h = tenantScoped?.baseline24h ?? null;
  const baseline7d = tenantScoped?.baseline7d ?? null;
  const auditApiRow = tenantScoped?.auditApi ?? null;
  const apiStats = auditApiRow?.p50_ms != null || auditApiRow?.p95_ms != null ? auditApiRow : null;
  const failedJobs24h = tenantScoped?.failed24h ?? null;
  const oldestQueued = tenantScoped?.oldestQueued ?? null;
  const topTables = await db.getMany<{ table_name: string; total_bytes: string }>(
    `SELECT relname AS table_name, pg_total_relation_size(c.oid)::bigint::text AS total_bytes
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND n.nspname NOT IN ('pg_catalog', 'information_schema')
     ORDER BY pg_total_relation_size(c.oid) DESC
     LIMIT 5`,
  ).catch(() => []);
  const connectionStats = await db.getOne<{ active_connections: string; max_connections: string }>(
    `SELECT
       (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database())::text AS active_connections,
       (SELECT setting FROM pg_settings WHERE name = 'max_connections')::text AS max_connections`,
  ).catch(() => null);
  const slowQueryStats = await db.getOne<{ slow_queries_per_min: string | null }>(
    `SELECT CASE
            WHEN reset.stats_reset IS NOT NULL AND reset.elapsed_sec > 0
            THEN (agg.slow_calls / (reset.elapsed_sec / 60.0))
            ELSE NULL
          END::text AS slow_queries_per_min
     FROM (
       SELECT coalesce(sum(calls) FILTER (WHERE mean_exec_time >= 500), 0) AS slow_calls
       FROM pg_stat_statements
     ) agg
     CROSS JOIN (
       SELECT
         stats_reset,
         EXTRACT(EPOCH FROM (now() - stats_reset)) AS elapsed_sec
       FROM pg_stat_statements_info
     ) reset`,
  ).catch(() => null);
  const queryLatencyStats = await db.getOne<{ p50_ms: string | null; p95_ms: string | null }>(
    `SELECT
       percentile_cont(0.5) WITHIN GROUP (ORDER BY mean_exec_time)::text AS p50_ms,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY mean_exec_time)::text AS p95_ms
     FROM pg_stat_statements
     WHERE calls > 0`,
  ).catch(() => null);

  const dbTotalBytes = dbSize?.total_bytes ? Number(dbSize.total_bytes) : null;
  const growthBytes24h = dbTotalBytes != null && baseline24h?.total_bytes
    ? dbTotalBytes - Number(baseline24h.total_bytes)
    : null;
  const growthBytes7d = dbTotalBytes != null && baseline7d?.total_bytes
    ? dbTotalBytes - Number(baseline7d.total_bytes)
    : null;
  const activeConnections = connectionStats?.active_connections ? Number(connectionStats.active_connections) : null;
  const maxConnections = connectionStats?.max_connections ? Number(connectionStats.max_connections) : null;
  const connectionUsagePct = activeConnections != null && maxConnections != null && maxConnections > 0
    ? (activeConnections / maxConnections) * 100
    : null;
  const dbP95 = queryLatencyStats?.p95_ms ? Number(queryLatencyStats.p95_ms) : null;
  const dbSlowPerMin = slowQueryStats?.slow_queries_per_min ? Number(slowQueryStats.slow_queries_per_min) : null;
  const dbStatus = maxStatus(
    statusFromThresholds(connectionUsagePct, 70, 90),
    statusFromThresholds(dbP95, 300, 800),
    statusFromThresholds(dbSlowPerMin, 5, 20),
    dbOk ? 'healthy' : 'critical',
  );

  const apiP95 = apiStats?.p95_ms ? Number(apiStats.p95_ms) : null;
  const apiErr5xx = apiStats?.error_rate_5xx_pct ? Number(apiStats.error_rate_5xx_pct) : null;
  const apiStatus = maxStatus(
    statusFromThresholds(apiP95, 300, 800),
    statusFromThresholds(apiErr5xx, 1, 3),
  );

  const queueBacklog = queueStats.pending;
  const queueOldestAgeSec = oldestQueued?.oldest_age_sec ? Number(oldestQueued.oldest_age_sec) : null;
  const queueStatus = maxStatus(
    statusFromThresholds(queueBacklog, 50, 200),
    statusFromThresholds(queueOldestAgeSec, 300, 1800),
  );

  const response: SystemMetricsResponse = {
    timestamp: nowIso,
    database: {
      totalBytes: Number.isFinite(dbTotalBytes) ? dbTotalBytes : null,
      growthBytes24h: Number.isFinite(growthBytes24h) ? growthBytes24h : null,
      growthBytes7d: Number.isFinite(growthBytes7d) ? growthBytes7d : null,
      topTables: topTables.map((row) => ({
        table: row.table_name,
        bytes: Number(row.total_bytes) || 0,
      })),
      p50QueryMs: queryLatencyStats?.p50_ms ? Number(queryLatencyStats.p50_ms) : null,
      p95QueryMs: dbP95,
      slowQueriesPerMin: dbSlowPerMin,
      activeConnections: Number.isFinite(activeConnections) ? activeConnections : null,
      maxConnections: Number.isFinite(maxConnections) ? maxConnections : null,
      connectionUsagePct,
      status: dbStatus,
      lastUpdatedAt: nowIso,
    },
    api: {
      p50Ms: apiStats?.p50_ms ? Number(apiStats.p50_ms) : null,
      p95Ms: apiP95,
      p99Ms: apiStats?.p99_ms ? Number(apiStats.p99_ms) : null,
      rpm: apiStats?.rpm ? Number(apiStats.rpm) : null,
      errorRate5xxPct: apiErr5xx,
      errorRate4xxPct: apiStats?.error_rate_4xx_pct ? Number(apiStats.error_rate_4xx_pct) : null,
      status: apiStatus,
      sourceWindowMinutes: apiWindowMinutes,
      lastUpdatedAt: nowIso,
    },
    queue: {
      backlog: queueBacklog,
      failed24h: failedJobs24h?.failed_jobs ? Number(failedJobs24h.failed_jobs) : null,
      oldestQueuedAgeSec: queueOldestAgeSec,
      status: queueStatus,
      lastUpdatedAt: nowIso,
    },
    runtime: {
      uptimeSec: Math.floor((Date.now() - processStartedAtMs) / 1000),
      version: '0.1.6',
      appStatus,
      dbStatus: dbOk ? 'connected' : 'disconnected',
      redisStatus: redis.enabled ? (redis.connected ? 'connected' : 'disconnected') : 'disabled',
      temporalStatus: temporalOk ? 'connected' : 'disconnected',
      workerStatus: workerRecent ? 'alive' : 'stale',
      schemaStatus: schema.ok ? 'compatible' : 'mismatch',
      lastDeployAt: null,
      lastUpdatedAt: nowIso,
    },
  };

  res.json(response);
});

export default router;
