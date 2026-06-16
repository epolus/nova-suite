/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Main Entry Point ───

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import { logger } from './logger';
import { db } from './data/db';
import { errorHandler } from './middleware/errorHandler';
import apiRouter from './api/routes';
import { openApiSpec } from './openapi';
import { cacheMetrics, cacheShutdown } from './cache/redis';
import {
  getWorkflowStartQueueStats,
  startWorkflowStartQueueDispatcher,
  stopWorkflowStartQueueDispatcher,
} from './temporal/workflow-start-queue';
import { checkTemporalHealth, startDbSizeSnapshotSchedule, startMetricSnapshotSchedule } from './temporal/workflows';
import { metricsHandler, metricsMiddleware } from './observability/metrics';

type SchemaRuntimeStatus = {
  compatible: boolean;
  expectedVersion: string;
  actualVersion: string | null;
  reason: string;
};

const schemaRuntimeStatus: SchemaRuntimeStatus = {
  compatible: false,
  expectedVersion: config.db.expectedSchemaVersion,
  actualVersion: null,
  reason: 'not_checked',
};
let dbSizeSnapshotScheduleStatus: 'not_started' | 'running' | 'failed' = 'not_started';
let metricSnapshotScheduleStatus: 'not_started' | 'running' | 'failed' = 'not_started';
let snapshotScheduleRetryTimer: NodeJS.Timeout | null = null;
let workflowDispatcherStarted = false;
let server: ReturnType<typeof app.listen> | null = null;

const app = express();
app.set('trust proxy', 1);

// ─── Global Middleware ───
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      // Keep /docs usable on plain-http LAN/dev setups (no forced https asset upgrade).
      upgradeInsecureRequests: null,
    },
  },
}));
app.use(cors({ origin: config.cors.origin }));
app.use(express.json({ limit: '1mb' }));
app.use(metricsMiddleware);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please retry later.' },
});
const mutatingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please slow down and retry.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/sso', authLimiter);
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    mutatingLimiter(req, res, next);
    return;
  }
  next();
});

// ─── Request Logging ───
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, 'request');
  next();
});

// ─── Health Check ───
app.get('/health', async (_req, res) => {
  const dbOk = await db.healthCheck();
  const redis = cacheMetrics() as { connected?: boolean; enabled?: boolean };
  const temporalOk = await checkTemporalHealth();
  const queueStats = await getWorkflowStartQueueStats().catch(() => ({ pending: 0, failed: 0 }));
  const workerHeartbeat = await db.getOne<{ last_seen_at: string | null }>(
    'SELECT max(last_seen_at) AS last_seen_at FROM worker_heartbeats',
  ).catch(() => ({ last_seen_at: null }));
  const lastSeenAt = workerHeartbeat?.last_seen_at ? new Date(workerHeartbeat.last_seen_at).getTime() : null;
  const workerRecent = lastSeenAt !== null && Date.now() - lastSeenAt < 120_000;
  const schemaCompatible = schemaRuntimeStatus.compatible;

  const status = dbOk && temporalOk && workerRecent && schemaCompatible ? 'healthy' : 'degraded';
  res.status(status === 'healthy' ? 200 : 503).json({
    status,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbOk ? 'connected' : 'disconnected',
      redis: redis.enabled ? (redis.connected ? 'connected' : 'disconnected') : 'disabled',
      temporal: temporalOk ? 'connected' : 'disconnected',
      worker: workerRecent ? 'alive' : 'stale',
      schema: schemaCompatible ? 'compatible' : 'mismatch',
      schema_expected_version: schemaRuntimeStatus.expectedVersion,
      schema_actual_version: schemaRuntimeStatus.actualVersion,
      schema_reason: schemaRuntimeStatus.reason,
      workflow_start_queue_pending: queueStats.pending,
      workflow_start_queue_failed: queueStats.failed,
      db_size_snapshot_schedule: dbSizeSnapshotScheduleStatus,
      metric_snapshot_schedule: metricSnapshotScheduleStatus,
    },
  });
});

app.get('/metrics', metricsHandler);

// ─── OpenAPI / Swagger UI ───
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customSiteTitle: 'Nova Suite API Docs',
  customCss: '.swagger-ui .topbar { display: none }',
}));
app.get('/docs.json', (_req, res) => res.json(openApiSpec));

// ─── API Routes ───
app.use('/api', apiRouter);

// ─── 404 Handler ───
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

// ─── Global Error Handler ───
app.use(errorHandler);

async function ensureDbSizeSnapshotScheduleStarted(): Promise<void> {
  try {
    await startDbSizeSnapshotSchedule();
    dbSizeSnapshotScheduleStatus = 'running';
  } catch (err) {
    dbSizeSnapshotScheduleStatus = 'failed';
    logger.warn({ err }, 'DB size snapshot schedule startup failed; will retry in background');
  }
}

async function ensureMetricSnapshotScheduleStarted(): Promise<void> {
  try {
    await startMetricSnapshotSchedule();
    metricSnapshotScheduleStatus = 'running';
  } catch (err) {
    metricSnapshotScheduleStatus = 'failed';
    logger.warn({ err }, 'Metric snapshot schedule startup failed; will retry in background');
  }
}

async function ensureSnapshotSchedulesStarted(): Promise<void> {
  await Promise.all([
    ensureDbSizeSnapshotScheduleStarted(),
    ensureMetricSnapshotScheduleStarted(),
  ]);

  if (dbSizeSnapshotScheduleStatus === 'running' && metricSnapshotScheduleStatus === 'running') {
    if (snapshotScheduleRetryTimer) {
      clearInterval(snapshotScheduleRetryTimer);
      snapshotScheduleRetryTimer = null;
    }
  }
}

async function bootstrap(): Promise<void> {
  const schemaCheck = await db.checkSchemaCompatibility(config.db.expectedSchemaVersion);
  schemaRuntimeStatus.compatible = schemaCheck.ok;
  schemaRuntimeStatus.expectedVersion = schemaCheck.expectedVersion;
  schemaRuntimeStatus.actualVersion = schemaCheck.actualVersion;
  schemaRuntimeStatus.reason = schemaCheck.reason;

  if (!schemaCheck.ok) {
    logger.warn(
      {
        expectedVersion: schemaCheck.expectedVersion,
        actualVersion: schemaCheck.actualVersion,
        reason: schemaCheck.reason,
        errorCode: schemaCheck.errorCode,
      },
      'Database schema version mismatch detected; API will run in degraded mode',
    );
  }

  server = app.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        env: config.nodeEnv,
        docs: `http://localhost:${config.port}/docs`,
      },
      'Nova Suite API started',
    );
  });

  if (schemaCheck.ok) {
    startWorkflowStartQueueDispatcher();
    workflowDispatcherStarted = true;
    await ensureSnapshotSchedulesStarted();
    if (dbSizeSnapshotScheduleStatus !== 'running' || metricSnapshotScheduleStatus !== 'running') {
      snapshotScheduleRetryTimer = setInterval(() => {
        void ensureSnapshotSchedulesStarted();
      }, 30_000);
    }
  } else {
    dbSizeSnapshotScheduleStatus = 'not_started';
    metricSnapshotScheduleStatus = 'not_started';
    logger.warn('Workflow start queue dispatcher disabled due to schema incompatibility');
  }
}

// ─── Graceful Shutdown ───
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down...');
  if (snapshotScheduleRetryTimer) {
    clearInterval(snapshotScheduleRetryTimer);
    snapshotScheduleRetryTimer = null;
  }
  if (workflowDispatcherStarted) stopWorkflowStartQueueDispatcher();
  if (server) {
    server.close(async () => {
      await cacheShutdown();
      await db.shutdown();
      process.exit(0);
    });
  } else {
    await cacheShutdown();
    await db.shutdown();
    process.exit(0);
  }
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

void bootstrap().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});

export default app;
