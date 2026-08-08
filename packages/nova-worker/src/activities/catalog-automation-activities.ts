/* SPDX-License-Identifier: AGPL-3.0-only */
import { log } from '@temporalio/activity';
import {
  AUTOMATION_SCHEMA_VERSION,
  collectCredSlugsFromAutomation,
  evaluateAdvancedCondition,
  executeAutomationGraph,
  parseAutomationConfig,
  resolveCredentialTemplateValues,
  toHttpActivityState,
} from '@nova-suite/shared';
import { withTenantContext } from '../db';
import { loadCredentialSecretsBySlugs } from '../credentials/vault';
import { getEmailProvider } from './email-provider';

export interface ExecuteAutomatedCatalogTaskInput {
  requestTaskId: string;
  requestId: string;
  tenantId: string;
}

export interface ExecuteAutomatedCatalogTaskResult {
  ok: boolean;
  message?: string;
  rejectRequest?: boolean;
  skipTaskOrders?: number[];
}

function truncateNotes(s: string, max = 8000): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

export async function skipRequestTasksByOrders(
  requestId: string,
  tenantId: string,
  taskOrders: number[],
): Promise<void> {
  if (taskOrders.length === 0) return;
  log.info('Skipping request tasks by orders', { requestId, taskOrders });
  await withTenantContext(tenantId, async (client) => {
    await client.query(
      `UPDATE request_tasks
       SET status = 'skipped',
           notes = COALESCE(notes, '') || E'\nSkipped by catalog automation branch.',
           completed_at = now()
       WHERE request_id = $1 AND task_order = ANY($2::int[])
         AND status IN ('pending', 'in_progress')`,
      [requestId, taskOrders],
    );
  });
}

export async function executeAutomatedCatalogTask(
  input: ExecuteAutomatedCatalogTaskInput,
): Promise<ExecuteAutomatedCatalogTaskResult> {
  const { requestTaskId, requestId, tenantId } = input;
  log.info('executeAutomatedCatalogTask', { requestTaskId, requestId });

  return withTenantContext(tenantId, async (client) => {
    const taskRow = await client.query(
      `SELECT rt.id, rt.task_order, rt.task_type, rt.status, rt.name,
              ct.automation_config
       FROM request_tasks rt
       LEFT JOIN catalog_tasks ct ON ct.id = rt.catalog_task_id
       WHERE rt.id = $1 AND rt.request_id = $2`,
      [requestTaskId, requestId],
    );
    if (taskRow.rows.length === 0) return { ok: false, message: 'Request task not found' };

    const row = taskRow.rows[0] as Record<string, unknown>;
    if (row.task_type !== 'automated') return { ok: false, message: 'Not an automated task' };
    if (row.status !== 'in_progress' && row.status !== 'pending') return { ok: true, message: 'Task already finalized' };

    const cfg = parseAutomationConfig(row.automation_config);
    if (!cfg) {
      const msg = `Invalid or missing automation_config (expected kind state_machine, schemaVersion=${AUTOMATION_SCHEMA_VERSION}, startAt/states).`;
      await client.query(
        `UPDATE request_tasks SET status = 'failed', completed_at = now(), notes = $1 WHERE id = $2`,
        [msg, requestTaskId],
      );
      return { ok: false, message: msg };
    }

    const reqRes = await client.query(
      `SELECT id, number, status, form_data, delivery_info, requester_id, requested_for FROM requests WHERE id = $1`,
      [requestId],
    );
    if (reqRes.rows.length === 0) return { ok: false, message: 'Request not found' };

    const request = reqRes.rows[0] as Record<string, unknown>;
    try {
      const slugList = collectCredSlugsFromAutomation(cfg);
      const rawCredMap = await loadCredentialSecretsBySlugs(client, tenantId, slugList);
      const credMap = await resolveCredentialTemplateValues(tenantId, rawCredMap, (msg, meta) =>
        log.info(msg, meta),
      );

      const emailProvider = getEmailProvider();
      const result = await executeAutomationGraph({
        cfg,
        request,
        credMap,
        requestId,
        requestTaskId,
        tenantId,
        client,
        automationSharedKey: process.env.CATALOG_AUTOMATION_SHARED_KEY,
        sendEmail: async (input) => {
          const sent = await emailProvider.send({ ...input, html: null });
          return { ok: sent.accepted, error: sent.error };
        },
        onLog: (msg, meta) => log.info(msg, meta),
      });

      await client.query(
        `UPDATE request_tasks SET status = $1, completed_at = now(), completed_by = NULL, notes = $2 WHERE id = $3`,
        [result.ok ? 'completed' : 'failed', truncateNotes(JSON.stringify(result.notes)), requestTaskId],
      );

      return {
        ok: result.ok,
        message: result.message,
        rejectRequest: result.rejectRequest,
        skipTaskOrders: result.skipTaskOrders,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await client.query(
        `UPDATE request_tasks
         SET status = 'failed', completed_at = now(), completed_by = NULL, notes = $1
         WHERE id = $2`,
        [truncateNotes(`Automated execution failed: ${message}`), requestTaskId],
      );
      // Infra/config failures should not leave requests hanging in progress.
      return { ok: false, message, rejectRequest: true };
    }
  });
}

export const __test__ = {
  evaluateAdvancedCondition,
  toHttpActivityState,
};
