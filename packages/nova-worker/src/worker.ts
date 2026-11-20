/* SPDX-License-Identifier: AGPL-3.0-only */
import { writeFile } from 'node:fs/promises';
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
import { config } from './config';
import { assertRuntimeRoleCannotBypassRls, checkSchemaCompatibility, heartbeat, shutdown as dbShutdown } from './db';

// Read by the Dockerfile HEALTHCHECK; keep the path in sync.
const HEALTH_FILE = '/tmp/nova-worker-healthy';

async function run() {
  await assertRuntimeRoleCannotBypassRls();
  const schemaCheck = await checkSchemaCompatibility(config.db.expectedSchemaVersion);
  if (!schemaCheck.ok) {
    throw new Error(
      `Schema mismatch (expected=${schemaCheck.expectedVersion}, actual=${schemaCheck.actualVersion}, reason=${schemaCheck.reason}). Worker execution disabled.`,
    );
  }

  console.log(`[nova-worker] Connecting to Temporal at ${config.temporal.address}...`);

  const connection = await NativeConnection.connect({
    address: config.temporal.address,
  });

  const worker = await Worker.create({
    connection,
    namespace: config.temporal.namespace,
    taskQueue: config.temporal.taskQueue,
    workflowsPath: require.resolve('./workflows'),
    activities,
    shutdownGraceTime: config.temporal.shutdownGraceMs,
    shutdownForceTime: config.temporal.shutdownGraceMs + 10_000,
  });

  console.log(`[nova-worker] Worker started on task queue "${config.temporal.taskQueue}"`);
  console.log('[nova-worker] Registered workflows: incidentEscalation, incidentAutoClose, catalogFulfillment, dataSourceSync, dataManagementJob, knowledgeApproval, notificationDispatch, systemMetricsDbSizeSnapshot, metricSnapshotsDaily, problemRecurrenceScan, inboundEmailPoll, auditEventsRetention, majorIncidentWorkflow, postmortemWorkflow');
  console.log(`[nova-worker] Registered activities: ${Object.keys(activities).join(', ')}`);
  const workerName = process.env.NOVA_WORKER_NAME || `worker-${process.pid}`;
  const pulse = async () => {
    try {
      await heartbeat(workerName);
      await writeFile(HEALTH_FILE, String(Date.now()));
    } catch (err) {
      console.warn('[nova-worker] failed to write heartbeat', err);
    }
  };
  await pulse();
  const heartbeatTimer = setInterval(() => void pulse(), 30_000);

  // worker.run() resolves once in-flight tasks have drained (or the grace time expired).
  const requestShutdown = (signal: string) => {
    if (worker.getState() !== 'RUNNING') return;
    console.log(`[nova-worker] ${signal} received, draining (grace ${config.temporal.shutdownGraceMs}ms)...`);
    worker.shutdown();
  };
  process.on('SIGINT', () => requestShutdown('SIGINT'));
  process.on('SIGTERM', () => requestShutdown('SIGTERM'));

  try {
    await worker.run();
  } finally {
    clearInterval(heartbeatTimer);
    await connection.close().catch((err) => console.warn('[nova-worker] closing Temporal connection failed', err));
    await dbShutdown().catch((err) => console.warn('[nova-worker] closing DB pool failed', err));
  }
  console.log('[nova-worker] Stopped');
}

process.on('unhandledRejection', (reason) => {
  console.error('[nova-worker] Unhandled promise rejection:', reason);
});

run().then(
  () => process.exit(0),
  (err) => {
    console.error('[nova-worker] Fatal error:', err);
    process.exit(1);
  },
);
