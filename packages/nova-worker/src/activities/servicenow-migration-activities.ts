/* SPDX-License-Identifier: AGPL-3.0-only */
import { ApplicationFailure, Context, log } from '@temporalio/activity';
import type { PoolClient } from 'pg';
import {
  serviceNowExtractOptionsSchema,
  serviceNowSnapshotSchema,
  transformServiceNowSnapshot,
} from '@nova-suite/shared/migrators/servicenow';
import {
  extractServiceNowSnapshot,
  loadCredentialSecretsBySlugs,
  parseServiceNowCredentialSecret,
  ServiceNowApiError,
  ServiceNowClient,
  type ServiceNowFetch,
} from '@nova-suite/shared/node';
import { config } from '../config';
import { withTenantContext } from '../db';

export interface ServiceNowMigrationInput {
  runId: string;
  tenantId: string;
}

type Deps = {
  withTenant: <T>(tenantId: string, fn: (client: PoolClient) => Promise<T>) => Promise<T>;
  loadSecret: (client: PoolClient, tenantId: string, slug: string) => Promise<string | undefined>;
  fetchImpl?: ServiceNowFetch;
  schemaVersion: string;
  heartbeat: (detail?: unknown) => void;
  logInfo?: (message: string, meta: Record<string, unknown>) => void;
};

const PROGRESS_MIN_INTERVAL_MS = 2_000;

function activityHeartbeat(detail?: unknown): void {
  try {
    Context.current().heartbeat(detail);
  } catch {
    // Outside an activity context (tests).
  }
}

const defaultDeps: Deps = {
  withTenant: withTenantContext,
  loadSecret: async (client, tenantId, slug) =>
    (await loadCredentialSecretsBySlugs(client, config.credentials.masterKey, tenantId, [slug]))[slug],
  schemaVersion: config.db.expectedSchemaVersion,
  heartbeat: activityHeartbeat,
  logInfo: (message, meta) => log.info(message, meta),
};

type RunRow = {
  instance_url: string;
  credential_slug: string;
  options: unknown;
  status: string;
};

async function loadRun(client: PoolClient, runId: string): Promise<RunRow> {
  const result = await client.query<RunRow>(
    'SELECT instance_url, credential_slug, options, status FROM migration_runs WHERE id = $1',
    [runId],
  );
  const row = result.rows[0];
  if (!row) throw ApplicationFailure.nonRetryable(`Migration run ${runId} not found`, 'MigrationRunNotFound');
  return row;
}

async function setStatus(client: PoolClient, runId: string, status: string, progress?: Record<string, unknown>): Promise<void> {
  await client.query(
    `UPDATE migration_runs
     SET status = $2, progress = progress || $3::jsonb
     WHERE id = $1`,
    [runId, status, JSON.stringify(progress ?? {})],
  );
}

function toFailure(err: unknown): unknown {
  if (err instanceof ServiceNowApiError && (err.status === 401 || err.status === 403)) {
    return ApplicationFailure.nonRetryable(err.message, 'ServiceNowAccessDenied');
  }
  return err;
}

export function createServiceNowMigrationActivities(deps: Deps) {
  async function extractServiceNowMigrationSnapshot(
    input: ServiceNowMigrationInput,
  ): Promise<{ items: number; flows: number; warnings: number; requests: number }> {
    const { runId, tenantId } = input;
    const { run, secret } = await deps.withTenant(tenantId, async (client) => {
      const r = await loadRun(client, runId);
      const s = await deps.loadSecret(client, tenantId, r.credential_slug);
      await setStatus(client, runId, 'extracting', { stage: 'connecting', started_at: new Date().toISOString() });
      return { run: r, secret: s };
    });
    if (!secret) {
      throw ApplicationFailure.nonRetryable(`Credential "${run.credential_slug}" was not found in the vault`, 'CredentialMissing');
    }
    let auth;
    try {
      auth = parseServiceNowCredentialSecret(secret, run.instance_url);
    } catch (err) {
      throw ApplicationFailure.nonRetryable(err instanceof Error ? err.message : 'Invalid credential', 'CredentialInvalid');
    }
    const options = serviceNowExtractOptionsSchema.parse(run.options ?? {});
    const client = new ServiceNowClient({ instanceUrl: run.instance_url, auth, fetchImpl: deps.fetchImpl });

    let lastWrite = 0;
    const onProgress = async (stage: string, detail?: Record<string, unknown>) => {
      deps.heartbeat({ stage, ...detail });
      const now = Date.now();
      if (now - lastWrite < PROGRESS_MIN_INTERVAL_MS) return;
      lastWrite = now;
      await deps.withTenant(tenantId, (c) =>
        setStatus(c, runId, 'extracting', { stage, ...detail, requests: client.requestCount }));
    };

    let snapshot;
    try {
      snapshot = await extractServiceNowSnapshot(client, options, onProgress);
    } catch (err) {
      throw toFailure(err);
    }
    const summary = {
      items: snapshot.items.length,
      flows: snapshot.flows.length,
      warnings: snapshot.warnings.length,
      requests: client.requestCount,
    };
    await deps.withTenant(tenantId, async (c) => {
      await c.query('UPDATE migration_runs SET snapshot = $2::jsonb WHERE id = $1', [runId, JSON.stringify(snapshot)]);
      await setStatus(c, runId, 'transforming', { stage: 'extracted', extracted: summary });
    });
    deps.logInfo?.('ServiceNow snapshot extracted', { runId, ...summary });
    return summary;
  }

  async function transformServiceNowMigrationSnapshot(
    input: ServiceNowMigrationInput,
  ): Promise<{ items: number; full: number; partial: number; unsupported: number }> {
    const { runId, tenantId } = input;
    const raw = await deps.withTenant(tenantId, async (client) => {
      const result = await client.query<{ snapshot: unknown }>('SELECT snapshot FROM migration_runs WHERE id = $1', [runId]);
      return result.rows[0]?.snapshot;
    });
    if (!raw) throw ApplicationFailure.nonRetryable('Migration run has no snapshot', 'SnapshotMissing');
    const parsed = serviceNowSnapshotSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApplicationFailure.nonRetryable(`Snapshot is invalid: ${parsed.error.message.slice(0, 500)}`, 'SnapshotInvalid');
    }
    const { package: pkg, report } = transformServiceNowSnapshot(parsed.data, { schemaVersion: deps.schemaVersion });
    await deps.withTenant(tenantId, async (client) => {
      await client.query(
        `UPDATE migration_runs
         SET package = $2::jsonb, report = $3::jsonb, status = 'ready', error = NULL, completed_at = now(),
             progress = progress || jsonb_build_object('stage', 'ready')
         WHERE id = $1`,
        [runId, JSON.stringify(pkg), JSON.stringify(report)],
      );
    });
    const { items, full, partial, unsupported } = report.totals;
    return { items, full, partial, unsupported };
  }

  async function failServiceNowMigration(input: ServiceNowMigrationInput & { error: string }): Promise<void> {
    await deps.withTenant(input.tenantId, async (client) => {
      await client.query(
        `UPDATE migration_runs
         SET status = 'failed', error = $2, completed_at = now()
         WHERE id = $1 AND status <> 'applied'`,
        [input.runId, input.error.slice(0, 2000)],
      );
    });
  }

  return { extractServiceNowMigrationSnapshot, transformServiceNowMigrationSnapshot, failServiceNowMigration };
}

export const {
  extractServiceNowMigrationSnapshot,
  transformServiceNowMigrationSnapshot,
  failServiceNowMigration,
} = createServiceNowMigrationActivities(defaultDeps);
