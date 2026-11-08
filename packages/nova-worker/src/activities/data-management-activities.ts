/* SPDX-License-Identifier: AGPL-3.0-only */
import fs from 'node:fs';
import path from 'node:path';
import {
  DATA_MANAGEMENT_CHUNK_SIZE,
  compileDataManagementMatch,
  dataManagementIdPageSql,
  dataManagementTargetSpec,
  type DataManagementAction,
  type DataManagementFilter,
} from '@nova-suite/shared';
import { config } from '../config';
import { withTenantContext } from '../db';

type JobRow = {
  id: string;
  actor_user_id: string | null;
  target: string;
  action: DataManagementAction;
  filters: DataManagementFilter[];
  include_open: boolean;
  status: string;
  match_count: number | null;
};

const AUDIT_SQL = `INSERT INTO audit_events (
  tenant_id, actor_user_id, action, category, level, entity_type, entity_id, metadata
) VALUES (current_tenant_id(), $1, $2, 'data_management', $3, 'data_management_job', $4, $5::jsonb)`;

export async function runDataManagementJob(jobId: string, tenantId: string): Promise<void> {
  const job = await withTenantContext(tenantId, async (client) => {
    const result = await client.query<JobRow>(
      `SELECT id, actor_user_id, target, action, filters, include_open, status, match_count
       FROM data_management_jobs
       WHERE id = $1`,
      [jobId],
    );
    const row = result.rows[0];
    if (!row || row.status === 'completed' || row.status === 'cancelled') return row ?? null;
    await client.query(
      `UPDATE data_management_jobs
       SET status = 'running', started_at = COALESCE(started_at, now()), error = NULL, updated_at = now()
       WHERE id = $1 AND status IN ('pending', 'running', 'failed')`,
      [jobId],
    );
    return row;
  });

  if (!job || job.status === 'completed' || job.status === 'cancelled') return;
  const specResult = resolveTarget(job);
  if (typeof specResult === 'string') {
    await failJob(tenantId, job, specResult);
    return;
  }
  const spec = specResult;

  try {
    const match = compileDataManagementMatch(job.target, job.filters, {
      includeOpen: job.include_open,
      onlyActive: job.action === 'archive',
    });
    const pageSql = dataManagementIdPageSql(job.target, match);
    let cursor: string | null = null;
    let finished = false;

    for (let step = 0; step < 20_000 && !finished; step += 1) {
      const chunk = await withTenantContext(tenantId, async (client) => {
        await client.query('BEGIN');
        try {
          const status = await client.query<{ status: string }>(
            `SELECT status FROM data_management_jobs WHERE id = $1`,
            [jobId],
          );
          if (status.rows[0]?.status === 'cancelled') {
            await client.query('ROLLBACK');
            return { cancelled: true, ids: [] as string[], keys: [] as string[] };
          }
          const selected = await client.query<{ id: string }>(
            pageSql,
            [...match.values, cursor, DATA_MANAGEMENT_CHUNK_SIZE],
          );
          const ids = selected.rows.map((row) => row.id);
          if (ids.length === 0) {
            await client.query('COMMIT');
            return { cancelled: false, ids, keys: [] as string[] };
          }

          let keys: string[] = [];
          let affected = ids.length;
          if (job.action === 'delete') {
            for (const statement of spec.beforeDelete) {
              await client.query(statement, [ids]);
            }
            const attachments = await client.query<{ storage_key: string }>(
              `SELECT storage_key
               FROM attachments
               WHERE entity_type = ANY($2::text[]) AND entity_id = ANY($1::uuid[])`,
              [ids, spec.cleanupEntityTypes],
            );
            keys = attachments.rows.map((row) => row.storage_key);
            await client.query(
              `DELETE FROM attachments WHERE entity_type = ANY($2::text[]) AND entity_id = ANY($1::uuid[])`,
              [ids, spec.cleanupEntityTypes],
            );
            await client.query(
              `DELETE FROM chat_threads WHERE entity_type = ANY($2::text[]) AND entity_id = ANY($1::uuid[])`,
              [ids, spec.cleanupEntityTypes],
            );
            const deleted = await client.query(
              `DELETE FROM ${spec.table} WHERE id = ANY($1::uuid[])`,
              [ids],
            );
            affected = deleted.rowCount ?? ids.length;
          } else {
            const archived = await client.query(
              `UPDATE ${spec.table}
               SET is_active = false, updated_at = now()
               WHERE id = ANY($1::uuid[]) AND is_active = true`,
              [ids],
            );
            affected = archived.rowCount ?? 0;
          }

          await client.query(
            `UPDATE data_management_jobs
             SET affected_count = affected_count + $2, updated_at = now()
             WHERE id = $1`,
            [jobId, affected],
          );
          await client.query('COMMIT');
          return { cancelled: false, ids, keys };
        } catch (err) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // connection may already be unusable
          }
          throw err;
        }
      });

      if (chunk.cancelled) return;
      if (chunk.ids.length === 0) {
        finished = true;
        break;
      }
      const nextCursor = chunk.ids[chunk.ids.length - 1];
      if (nextCursor === cursor) {
        throw new Error('Retention job did not advance');
      }
      cursor = nextCursor;
      for (const key of chunk.keys) unlinkStorageKey(config.uploads.dir, key);
    }

    if (!finished) throw new Error('Retention job exceeded the chunk limit');
  } catch (err) {
    await failJob(tenantId, job, err instanceof Error ? err.message : 'Data management job failed');
    throw err;
  }

  await withTenantContext(tenantId, async (client) => {
    await client.query(
      `UPDATE data_management_jobs
       SET status = 'completed', completed_at = now(), error = NULL, updated_at = now()
       WHERE id = $1 AND status = 'running'`,
      [jobId],
    );
    const fresh = await client.query<{ affected_count: number; match_count: number | null }>(
      `SELECT affected_count, match_count FROM data_management_jobs WHERE id = $1`,
      [jobId],
    );
    try {
      await writeAudit(client, job, 'job.completed', 'info', {
        target: job.target,
        action: job.action,
        filters: job.filters,
        include_open: job.include_open,
        match_count: fresh.rows[0]?.match_count ?? job.match_count,
        affected_count: fresh.rows[0]?.affected_count ?? 0,
      });
    } catch (err) {
      console.warn('[nova-worker] failed to write data management audit', err);
    }
  });
}

async function failJob(tenantId: string, job: JobRow, message: string): Promise<void> {
  const error = message.slice(0, 2000);
  try {
    await withTenantContext(tenantId, async (client) => {
      await client.query(
        `UPDATE data_management_jobs
         SET status = 'failed', error = $2, completed_at = now(), updated_at = now()
         WHERE id = $1 AND status <> 'completed'`,
        [job.id, error],
      );
      await writeAudit(client, job, 'job.failed', 'warning', {
        target: job.target,
        action: job.action,
        filters: job.filters,
        include_open: job.include_open,
        match_count: job.match_count,
        error,
      });
    });
  } catch (err) {
    console.warn('[nova-worker] failed to record data management failure', err);
  }
}

async function writeAudit(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  job: JobRow,
  action: string,
  level: 'info' | 'warning',
  metadata: Record<string, unknown>,
): Promise<void> {
  await client.query(AUDIT_SQL, [
    job.actor_user_id,
    action,
    level,
    job.id,
    JSON.stringify(metadata),
  ]);
}

function resolveTarget(job: JobRow): ReturnType<typeof dataManagementTargetSpec> | string {
  try {
    const found = dataManagementTargetSpec(job.target);
    if (!found.actions.includes(job.action)) {
      return `Action "${job.action}" is not allowed for ${job.target}`;
    }
    return found;
  } catch (err) {
    return err instanceof Error ? err.message : `Unsupported target "${job.target}"`;
  }
}

function unlinkStorageKey(uploadDir: string, storageKey: string): void {
  if (!storageKey || storageKey.includes('\0') || storageKey.includes('..') || path.isAbsolute(storageKey)) return;
  const root = path.resolve(uploadDir);
  const resolved = path.resolve(root, storageKey);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!resolved.startsWith(prefix)) return;
  try {
    fs.unlinkSync(resolved);
  } catch {
    // file may already be gone
  }
}
