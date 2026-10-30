/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { selectPackageItems, type MigrationConfigPackage } from '@nova-suite/shared/migrators/servicenow';
import {
  loadCredentialSecretsBySlugs,
  normalizeServiceNowInstanceUrl,
  parseServiceNowCredentialSecret,
  probeServiceNowInstance,
  ServiceNowApiError,
  ServiceNowClient,
} from '@nova-suite/shared/node';
import { db } from '../../../data/db';
import { authenticate, requireRole, setTenantRLS, releaseTenantClient, getRequestClient } from '../../../middleware/auth';
import { validateBody } from '../../../middleware/validate';
import { AppError, BadRequest, Conflict, NotFound } from '../../../middleware/errorHandler';
import { config } from '../../../config';
import { recordAuditEvent } from '../../../audit/events';
import { getClientIp } from '../../../middleware/client-ip';
import { logger } from '../../../logger';
import { startServiceNowMigration } from '../../../temporal/workflows';
import {
  configPackageBundleSchema,
  serviceNowApplySchema,
  serviceNowConnectionSchema,
  serviceNowCreateRunSchema,
} from '../../../domain/schemas';
import { validateAndApplyConfigPackage } from '../../config-packages/service';

const router = Router();
router.use(authenticate, requireRole('admin'), setTenantRLS, releaseTenantClient);

const connectionSchema = serviceNowConnectionSchema;
const createRunSchema = serviceNowCreateRunSchema;
const applySchema = serviceNowApplySchema;

const RUN_SUMMARY_COLUMNS = `id, source, instance_url, credential_slug, options, status, progress, error,
  config_package_run_id, created_by, created_at, updated_at, completed_at,
  report->'totals' AS totals`;

function serviceNowError(err: unknown): AppError {
  if (err instanceof ServiceNowApiError) {
    if (err.status === 401) return BadRequest('ServiceNow rejected the credential (401)');
    if (err.status === 403) return BadRequest(`The ServiceNow user cannot read ${err.table ?? 'the requested table'} (403)`);
    return new AppError(502, `ServiceNow request failed (${err.status})`, 'UPSTREAM_ERROR');
  }
  const message = err instanceof Error ? err.message : String(err);
  return new AppError(502, `Could not reach ServiceNow: ${message}`, 'UPSTREAM_ERROR');
}

async function buildClient(req: Request, instanceUrlRaw: string, slug: string): Promise<ServiceNowClient> {
  let instanceUrl: string;
  try {
    instanceUrl = normalizeServiceNowInstanceUrl(instanceUrlRaw);
  } catch (err) {
    throw BadRequest(err instanceof Error ? err.message : 'Invalid instance URL');
  }
  const secrets = await loadCredentialSecretsBySlugs(
    getRequestClient(req),
    config.credentials.masterKey,
    req.user!.tenant_id,
    [slug],
  );
  const secret = secrets[slug];
  if (!secret) throw BadRequest(`Credential "${slug}" was not found in the vault`);
  try {
    return new ServiceNowClient({ instanceUrl, auth: parseServiceNowCredentialSecret(secret, instanceUrl), maxRetries: 2 });
  } catch (err) {
    throw BadRequest(err instanceof Error ? err.message : 'Invalid ServiceNow credential');
  }
}

router.post('/test-connection', validateBody(connectionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as z.infer<typeof connectionSchema>;
    const client = await buildClient(req, body.instance_url, body.credential_slug);
    try {
      res.json(await probeServiceNowInstance(client));
    } catch (err) {
      throw serviceNowError(err);
    }
  } catch (err) {
    next(err);
  }
});

const ITEM_LIST_LIMIT = 2000;

async function browseCatalogs(client: ServiceNowClient) {
  const [catalogs, categories, items] = await Promise.all([
    client.list('sc_catalog', { query: 'active=true^ORDERBYtitle', fields: 'sys_id,title,description' }),
    client.list('sc_category', { query: 'active=true^ORDERBYtitle', fields: 'sys_id,title,parent,sc_catalog' }),
    client.list('sc_cat_item', {
      query: 'sys_class_nameNOT INsc_cat_item_guide,sc_cat_item_content,sc_cat_item_wizard^ORDERBYname',
      fields: 'sys_id,name,short_description,category,sc_catalogs,active,flow_designer_flow,workflow,sys_class_name',
      limit: ITEM_LIST_LIMIT,
    }),
  ]);
  return {
    catalogs,
    categories,
    items: items.map((i) => ({
      sys_id: String(i.sys_id ?? ''),
      name: String(i.name ?? ''),
      short_description: String(i.short_description ?? ''),
      category: String(i.category ?? ''),
      catalogs: String(i.sc_catalogs ?? '').split(',').filter(Boolean),
      active: String(i.active) === 'true',
      has_flow: Boolean(i.flow_designer_flow),
      has_legacy_workflow: Boolean(i.workflow),
      record_producer: String(i.sys_class_name) === 'sc_cat_item_producer',
    })),
    truncated: items.length >= ITEM_LIST_LIMIT,
  };
}

/** Prefer POST so credential_slug is not logged in query strings / Referer. */
router.post('/catalogs/browse', validateBody(connectionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as z.infer<typeof connectionSchema>;
    const client = await buildClient(req, body.instance_url, body.credential_slug);
    try {
      res.json(await browseCatalogs(client));
    } catch (err) {
      throw serviceNowError(err);
    }
  } catch (err) {
    next(err);
  }
});

router.post('/runs', validateBody(createRunSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as z.infer<typeof createRunSchema>;
    let instanceUrl: string;
    try {
      instanceUrl = normalizeServiceNowInstanceUrl(body.instance_url);
    } catch (err) {
      throw BadRequest(err instanceof Error ? err.message : 'Invalid instance URL');
    }
    const tenantId = req.user!.tenant_id;
    const runId = await db.withTenantTransaction(
      tenantId,
      req.user!.id,
      req.user!.roles.join(','),
      async (client) => {
        // Serialize concurrent starts per tenant (partial unique index is the durable guard).
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [`migration:${tenantId}`]);
        const cred = await client.query(
          'SELECT 1 FROM tenant_credentials WHERE tenant_id = $1 AND slug = $2',
          [tenantId, body.credential_slug],
        );
        if (cred.rowCount === 0) throw BadRequest(`Credential "${body.credential_slug}" was not found in the vault`);
        const active = await client.query(
          `SELECT id FROM migration_runs
           WHERE tenant_id = $1 AND status IN ('queued', 'extracting', 'transforming', 'applying')
           LIMIT 1`,
          [tenantId],
        );
        if ((active.rowCount ?? 0) > 0) throw Conflict('Another migration run is in progress');
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO migration_runs (tenant_id, source, instance_url, credential_slug, options, created_by)
           VALUES ($1, 'servicenow', $2, $3, $4::jsonb, $5)
           RETURNING id`,
          [tenantId, instanceUrl, body.credential_slug, JSON.stringify(body.options), req.user!.id],
        );
        return inserted.rows[0]!.id;
      },
    );
    try {
      await startServiceNowMigration({ runId, tenantId: req.user!.tenant_id });
    } catch (err) {
      logger.error({ err, runId }, 'Could not start ServiceNow migration workflow');
      await db.query(
        `UPDATE migration_runs SET status = 'failed', error = $2, completed_at = now() WHERE id = $1`,
        [runId, 'Workflow engine unavailable; try again later'],
      );
      throw new AppError(503, 'Workflow engine unavailable; try again later', 'TEMPORAL_UNAVAILABLE');
    }
    await recordAuditEvent({
      tenantId: req.user!.tenant_id,
      actorUserId: req.user!.id,
      category: 'config_deployment',
      action: 'servicenow_migration_started',
      level: 'info',
      entityType: 'migration_run',
      entityId: runId,
      clientIp: getClientIp(req),
      metadata: { instance_url: instanceUrl, credential_slug: body.credential_slug, options: body.options },
    });
    res.status(202).json({ id: runId, status: 'queued' });
  } catch (err) {
    next(err);
  }
});

router.get('/runs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await db.getMany(
      `SELECT ${RUN_SUMMARY_COLUMNS} FROM migration_runs
       WHERE tenant_id = $1 AND source = 'servicenow'
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user!.tenant_id],
    );
    res.json({ runs: rows });
  } catch (err) {
    next(err);
  }
});

function runIdParam(req: Request): string {
  const id = String(req.params.id ?? '');
  if (!z.string().uuid().safeParse(id).success) throw NotFound('Migration run not found');
  return id;
}

router.get('/runs/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await db.getOne(
      `SELECT ${RUN_SUMMARY_COLUMNS}, report, (package IS NOT NULL) AS has_package
       FROM migration_runs WHERE id = $1 AND tenant_id = $2`,
      [runIdParam(req), req.user!.tenant_id],
    );
    if (!row) throw NotFound('Migration run not found');
    res.json({ run: row });
  } catch (err) {
    next(err);
  }
});

router.get('/runs/:id/package', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await db.getOne<{ package: unknown }>(
      'SELECT package FROM migration_runs WHERE id = $1 AND tenant_id = $2',
      [runIdParam(req), req.user!.tenant_id],
    );
    if (!row) throw NotFound('Migration run not found');
    if (!row.package) throw Conflict('The migration run has no package yet');
    res.json({ package: row.package });
  } catch (err) {
    next(err);
  }
});

type GroupResolution = { created: string[]; unassigned: string[] };

/** Group names on catalog tasks and on manual-task/group-approval steps inside automations. */
function packageGroupNames(pkg: MigrationConfigPackage): string[] {
  const names = new Set<string>();
  for (const item of pkg.contents.catalog.service_items) {
    for (const task of item.tasks) {
      if (task.assigned_group_name) names.add(task.assigned_group_name);
      const states = (task.automation_config as { states?: Array<Record<string, unknown>> }).states ?? [];
      for (const st of states) {
        const group = st.type === 'action.task'
          ? st.groupTemplate
          : st.type === 'action.approval' && st.approverType === 'group' ? st.approverTemplate : undefined;
        if (typeof group === 'string' && group.trim() && !group.includes('{{')) names.add(group.trim());
      }
    }
  }
  return [...names];
}

/** Creates or clears assignment groups the package references but the tenant lacks. */
async function resolvePackageGroups(
  tenantId: string,
  userId: string,
  roles: string[],
  pkg: MigrationConfigPackage,
  createMissing: boolean,
): Promise<GroupResolution> {
  const names = packageGroupNames(pkg);
  if (names.length === 0) return { created: [], unassigned: [] };
  return db.withTenantTransaction(tenantId, userId, roles.join(','), async (client) => {
    const found = await client.query<{ name: string }>(
      `SELECT name FROM assignment_groups WHERE tenant_id = $1 AND lower(name) = ANY($2::text[])`,
      [tenantId, names.map((n) => n.toLowerCase())],
    );
    const existing = new Set(found.rows.map((r) => r.name.toLowerCase()));
    const missing = names.filter((n) => !existing.has(n.toLowerCase()));
    if (missing.length === 0) return { created: [], unassigned: [] };
    if (createMissing) {
      for (const name of missing) {
        await client.query(
          `INSERT INTO assignment_groups (tenant_id, name, description)
           VALUES ($1, $2, 'Created by the ServiceNow catalog migration')
           ON CONFLICT (tenant_id, name) DO NOTHING`,
          [tenantId, name],
        );
      }
      return { created: missing, unassigned: [] };
    }
    const missingSet = new Set(missing.map((n) => n.toLowerCase()));
    for (const item of pkg.contents.catalog.service_items) {
      for (const task of item.tasks) {
        if (task.assigned_group_name && missingSet.has(task.assigned_group_name.toLowerCase())) {
          task.assigned_group_name = null;
        }
        const states = (task.automation_config as { states?: Array<Record<string, unknown>> } | null)?.states;
        if (!states) continue;
        for (const st of states) {
          if (st.type === 'action.task' && typeof st.groupTemplate === 'string'
            && missingSet.has(st.groupTemplate.trim().toLowerCase())) {
            st.groupTemplate = '';
          }
          if (st.type === 'action.approval' && st.approverType === 'group'
            && typeof st.approverTemplate === 'string'
            && missingSet.has(st.approverTemplate.trim().toLowerCase())) {
            st.approverTemplate = '';
          }
        }
      }
    }
    return { created: [], unassigned: missing };
  });
}

router.post('/runs/:id/apply', validateBody(applySchema), async (req: Request, res: Response, next: NextFunction) => {
  const tenantId = req.user!.tenant_id;
  let claimed: { id: string; previous: string } | null = null;
  try {
    const id = runIdParam(req);
    const body = req.body as z.infer<typeof applySchema>;
    const row = await db.getOne<{ package: MigrationConfigPackage | null; previous: string }>(
      `WITH prev AS (
         SELECT id, status FROM migration_runs
         WHERE id = $1 AND tenant_id = $2 AND status IN ('ready', 'applied') AND package IS NOT NULL
         FOR UPDATE
       )
       UPDATE migration_runs m SET status = 'applying', error = NULL
       FROM prev WHERE m.id = prev.id
       RETURNING m.package, prev.status AS previous`,
      [id, tenantId],
    );
    if (!row?.package) {
      const exists = await db.getOne('SELECT status FROM migration_runs WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
      if (!exists) throw NotFound('Migration run not found');
      throw Conflict(`Migration run is ${String(exists.status)}; only ready or applied runs can be applied`);
    }
    claimed = { id, previous: row.previous };

    const selected = selectPackageItems(row.package, body.item_keys);
    if (selected.contents.catalog.service_items.length === 0) throw BadRequest('None of the selected items are in the package');
    const groups = await resolvePackageGroups(tenantId, req.user!.id, req.user!.roles, selected, body.create_missing_groups);

    const bundle = configPackageBundleSchema.parse(selected);
    const outcome = await validateAndApplyConfigPackage({
      tenantId,
      actorUserId: req.user!.id,
      roles: req.user!.roles,
      bundle,
    });
    if (!outcome.success) {
      await db.query(
        'UPDATE migration_runs SET status = $3, config_package_run_id = $2 WHERE id = $1',
        [id, outcome.run_id, claimed.previous],
      );
      claimed = null;
      res.status(400).json({ ...outcome, groups });
      return;
    }
    await db.query(
      `UPDATE migration_runs
       SET status = 'applied', config_package_run_id = $2, completed_at = now(),
           progress = progress || jsonb_build_object('applied_items', $3::int, 'applied_at', now())
       WHERE id = $1`,
      [id, outcome.run_id, selected.contents.catalog.service_items.length],
    );
    claimed = null;
    await recordAuditEvent({
      tenantId,
      actorUserId: req.user!.id,
      category: 'config_deployment',
      action: 'servicenow_migration_applied',
      level: 'info',
      entityType: 'migration_run',
      entityId: id,
      clientIp: getClientIp(req),
      metadata: { config_package_run_id: outcome.run_id, applied: outcome.applied, groups },
    });
    res.json({ ...outcome, groups });
  } catch (err) {
    if (claimed) {
      await db.query(
        'UPDATE migration_runs SET status = $2, error = $3 WHERE id = $1',
        [claimed.id, claimed.previous, err instanceof Error ? err.message.slice(0, 1000) : 'Apply failed'],
      ).catch(() => undefined);
    }
    next(err);
  }
});

export const __test__ = {
  packageGroupNames,
  resolvePackageGroups,
};

export default router;
