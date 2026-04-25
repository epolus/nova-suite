/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Main Entry Point ───

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { config } from './config';
import { logger } from './logger';
import { db } from './data/db';
import { errorHandler } from './middleware/errorHandler';
import apiRouter from './api/routes';
import { openApiSpec } from './openapi';
import { cacheShutdown } from './cache/redis';

const app = express();

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

// ─── Request Logging ───
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, 'request');
  next();
});

// ─── Health Check ───
app.get('/health', async (_req, res) => {
  const dbOk = await db.healthCheck();
  const status = dbOk ? 'healthy' : 'degraded';
  res.status(dbOk ? 200 : 503).json({
    status,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbOk ? 'connected' : 'disconnected',
    },
  });
});

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

// ─── Start Server ───
const server = app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      env: config.nodeEnv,
      docs: `http://localhost:${config.port}/docs`,
    },
    'Nova Suite API started',
  );
});

// ─── Graceful Shutdown ───
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down...');
  server.close(async () => {
    await cacheShutdown();
    await db.shutdown();
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
