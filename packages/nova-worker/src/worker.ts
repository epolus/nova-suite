/* SPDX-License-Identifier: AGPL-3.0-only */
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
import { config } from './config';
import { shutdown as dbShutdown } from './db';

async function run() {
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
  });

  console.log(`[nova-worker] Worker started on task queue "${config.temporal.taskQueue}"`);
  console.log('[nova-worker] Registered workflows: incidentEscalation, incidentAutoClose, catalogFulfillment, dataSourceSync, knowledgeApproval, notificationDispatch');
  console.log(`[nova-worker] Registered activities: ${Object.keys(activities).join(', ')}`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[nova-worker] Shutting down...');
    worker.shutdown();
    await dbShutdown();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await worker.run();
}

run().catch((err) => {
  console.error('[nova-worker] Fatal error:', err);
  process.exit(1);
});
