/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { PoolClient } from 'pg';
import { db } from '../../data/db';
import { authenticate, requireRole, setTenantRLS, releaseTenantClient } from '../../middleware/auth';
import { BadRequest } from '../../middleware/errorHandler';
import { config } from '../../config';
import { resolveUploadPath } from '../../data/upload-path';
import { recordAuditEvent } from '../../audit/events';
import { getClientIp } from '../../middleware/client-ip';
import {
  configPackageBundleSchema,
  configPackageApplySchema,
} from '../../domain/schemas';
import {
  backfillExternalKeys,
  checksumBundle,
  ensureConfigPackageSchema,
  recordDeploymentRun,
  sanitizeSourceConfigForExport,
  validateAndApplyConfigPackage,
  validateBundle,
  type ConfigPackageBundle,
  type ConfigPackageCategory,
  type ConfigPackageDataSource,
  type ConfigPackageNotificationRule,
  type ConfigPackageServiceItem,
} from './service';

const router = Router();

function contentTypeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

function readPackageBody(body: unknown): ConfigPackageBundle {
  if (body && typeof body === 'object' && 'package' in body) {
    return configPackageApplySchema.parse(body).package;
  }
  return configPackageBundleSchema.parse(body);
}

async function setRequestTenantContext(client: PoolClient, req: Request): Promise<void> {
  await db.setTenantContext(client, req.user!.tenant_id, req.user!.id, req.user!.roles.join(','));
}

function emptyBundle(name: string, tenantId: string): ConfigPackageBundle {
  return {
    format: 'nova.config-package',
    version: 1,
    name,
    schema_version: config.db.expectedSchemaVersion,
    exported_at: new Date().toISOString(),
    source: { tenant_id: tenantId },
    contents: {
      catalog: { categories: [], service_items: [] },
      notifications: { rules: [] },
      data_sources: { sources: [] },
      workflows: { definitions: [] },
    },
  };
}

async function loadPicture(storageKey: string | null): Promise<ConfigPackageServiceItem['picture']> {
  if (!storageKey) return null;
  let fullPath: string;
  try {
    fullPath = resolveUploadPath(config.uploads.dir, storageKey);
  } catch {
    return null;
  }
  if (!fs.existsSync(fullPath)) return null;
  const stat = fs.statSync(fullPath);
  if (stat.size > 512 * 1024) return null;
  const buffer = fs.readFileSync(fullPath);
  return {
    file_name: path.basename(fullPath),
    content_type: contentTypeForFile(fullPath),
    base64: buffer.toString('base64'),
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

async function exportCatalogItem(
  client: PoolClient,
  tenantId: string,
  itemId: string,
): Promise<{ category: ConfigPackageCategory; item: ConfigPackageServiceItem } | null> {
  const itemRes = await client.query<{
    id: string;
    external_key: string;
    category_id: string;
    category_external_key: string;
    category_name: string;
    category_description: string | null;
    category_icon: string | null;
    category_sort_order: number;
    category_is_active: boolean;
    name: string;
    short_description: string | null;
    description: string | null;
    icon: string | null;
    picture_storage_key: string | null;
    price: string | number | null;
    custom_attributes: Record<string, unknown>;
    form_schema: { fields: Array<Record<string, unknown>> };
    approval_required: boolean;
    sla_hours: number | null;
    is_active: boolean;
  }>(
    `SELECT si.*, sc.external_key AS category_external_key, sc.name AS category_name,
            sc.description AS category_description, sc.icon AS category_icon,
            sc.sort_order AS category_sort_order, sc.is_active AS category_is_active
     FROM service_items si
     JOIN service_categories sc ON sc.id = si.category_id
     WHERE si.tenant_id = $1 AND si.id = $2`,
    [tenantId, itemId],
  );
  const row = itemRes.rows[0];
  if (!row) return null;

  const taskRes = await client.query<{
    external_key: string;
    name: string;
    description: string | null;
    instructions: string | null;
    task_type: 'approval' | 'manual' | 'automated';
    task_order: number;
    assigned_group_name: string | null;
    sla_hours: number | null;
    automation_config: Record<string, unknown>;
    is_active: boolean;
  }>(
    `SELECT ct.external_key, ct.name, ct.description, ct.instructions, ct.task_type,
            ct.task_order, ag.name AS assigned_group_name, ct.sla_hours,
            ct.automation_config, ct.is_active
     FROM catalog_tasks ct
     LEFT JOIN assignment_groups ag ON ag.id = ct.assigned_group_id
     WHERE ct.tenant_id = $1 AND ct.service_item_id = $2
     ORDER BY ct.task_order, ct.created_at`,
    [tenantId, itemId],
  );

  return {
    category: {
      external_key: row.category_external_key,
      name: row.category_name,
      description: row.category_description,
      icon: row.category_icon || 'folder',
      sort_order: row.category_sort_order,
      is_active: row.category_is_active,
    },
    item: {
      external_key: row.external_key,
      category_external_key: row.category_external_key,
      name: row.name,
      short_description: row.short_description,
      description: row.description,
      icon: row.icon || 'box',
      picture: await loadPicture(row.picture_storage_key),
      price: row.price == null ? null : Number(row.price),
      custom_attributes: row.custom_attributes || {},
      form_schema: row.form_schema || { fields: [] },
      approval_required: row.approval_required,
      sla_hours: row.sla_hours || 72,
      is_active: row.is_active,
      tasks: taskRes.rows.map((task) => ({
        external_key: task.external_key,
        name: task.name,
        description: task.description,
        instructions: task.instructions,
        task_type: task.task_type,
        task_order: task.task_order,
        assigned_group_name: task.assigned_group_name,
        sla_hours: task.sla_hours,
        automation_config: task.automation_config || {},
        is_active: task.is_active,
      })),
    },
  };
}

async function exportNotificationRule(
  client: PoolClient,
  tenantId: string,
  ruleId: string,
): Promise<ConfigPackageNotificationRule | null> {
  const ruleRes = await client.query<{
    id: string;
    external_key: string;
    name: string;
    description: string | null;
    entity_type: 'incident' | 'request' | 'change' | 'problem' | 'knowledge' | 'major_incident';
    trigger_key: string;
    recipient_type: string;
    recipient_user_email: string | null;
    recipient_group_name: string | null;
    channels: Array<'in_app' | 'email' | 'slack' | 'teams'>;
    title_template: string;
    body_template: string | null;
    is_active: boolean;
    sort_order: number;
  }>(
    `SELECT nr.*, u.email AS recipient_user_email, ag.name AS recipient_group_name
     FROM notification_rules nr
     LEFT JOIN users u ON u.id = nr.recipient_user_id
     LEFT JOIN assignment_groups ag ON ag.id = nr.recipient_group_id
     WHERE nr.tenant_id = $1 AND nr.id = $2`,
    [tenantId, ruleId],
  );
  const rule = ruleRes.rows[0];
  if (!rule) return null;

  const templates = await client.query<ConfigPackageNotificationRule['templates'][number]>(
    `SELECT locale, title_template, body_template, body_html_template
     FROM notification_rule_templates
     WHERE tenant_id = $1 AND notification_rule_id = $2
     ORDER BY locale`,
    [tenantId, rule.id],
  );

  return {
    external_key: rule.external_key,
    name: rule.name,
    description: rule.description,
    entity_type: rule.entity_type,
    trigger_key: rule.trigger_key,
    recipient_type: rule.recipient_type,
    recipient_user_email: rule.recipient_user_email,
    recipient_group_name: rule.recipient_group_name,
    channels: rule.channels,
    templates: templates.rows,
    title_template: rule.title_template,
    body_template: rule.body_template,
    is_active: rule.is_active,
    sort_order: rule.sort_order,
  };
}

async function exportDataSource(
  client: PoolClient,
  tenantId: string,
  sourceId: string,
): Promise<ConfigPackageDataSource | null> {
  const result = await client.query<{
    external_key: string;
    name: string;
    description: string | null;
    entity_type: string;
    source_type: ConfigPackageDataSource['source_type'];
    source_config: Record<string, unknown>;
    column_mapping: Record<string, unknown>;
    schedule_cron: string;
    schedule_enabled: boolean;
    import_mode: ConfigPackageDataSource['import_mode'];
    upsert_key: string | null;
  }>(
    `SELECT external_key, name, description, entity_type, source_type,
            source_config, column_mapping, schedule_cron, schedule_enabled,
            import_mode, upsert_key
     FROM data_sources
     WHERE tenant_id = $1 AND id = $2
     LIMIT 1`,
    [tenantId, sourceId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    external_key: row.external_key,
    name: row.name,
    description: row.description,
    entity_type: row.entity_type,
    source_type: row.source_type,
    source_config: sanitizeSourceConfigForExport(row.source_config || {}),
    column_mapping: row.column_mapping || {},
    schedule_cron: row.schedule_cron,
    schedule_enabled: row.schedule_enabled,
    import_mode: row.import_mode,
    upsert_key: row.upsert_key,
  };
}

router.use(authenticate, requireRole('admin'), setTenantRLS, releaseTenantClient);

router.get('/export/catalog/items/:id', async (req: Request, res: Response, next: NextFunction) => {
  let client: PoolClient | null = null;
  try {
    await ensureConfigPackageSchema();
    client = await db.getClient();
    await setRequestTenantContext(client, req);
    await backfillExternalKeys(client, req.user!.tenant_id);
    const exported = await exportCatalogItem(client, req.user!.tenant_id, String(req.params.id));
    if (!exported) throw BadRequest('Service item not found');
    const bundle = emptyBundle(`Service item: ${exported.item.name}`, req.user!.tenant_id);
    bundle.contents.catalog.categories.push(exported.category);
    bundle.contents.catalog.service_items.push(exported.item);
    res.json({ package: bundle, checksum: checksumBundle(bundle) });
  } catch (err) {
    next(err);
  } finally {
    if (client) {
      await db.clearTenantContext(client).catch(() => undefined);
      client.release();
    }
  }
});

router.get('/export/catalog', async (req: Request, res: Response, next: NextFunction) => {
  let client: PoolClient | null = null;
  try {
    await ensureConfigPackageSchema();
    client = await db.getClient();
    await setRequestTenantContext(client, req);
    const tenantId = req.user!.tenant_id;
    await backfillExternalKeys(client, tenantId);
    const itemIds = await client.query<{ id: string }>(
      `SELECT id FROM service_items
       WHERE tenant_id = $1
       ORDER BY name`,
      [tenantId],
    );
    const bundle = emptyBundle('Service catalog configuration', tenantId);
    const categoryKeys = new Set<string>();
    for (const row of itemIds.rows) {
      const exported = await exportCatalogItem(client, tenantId, row.id);
      if (!exported) continue;
      if (!categoryKeys.has(exported.category.external_key)) {
        bundle.contents.catalog.categories.push(exported.category);
        categoryKeys.add(exported.category.external_key);
      }
      bundle.contents.catalog.service_items.push(exported.item);
    }
    res.json({ package: bundle, checksum: checksumBundle(bundle) });
  } catch (err) {
    next(err);
  } finally {
    if (client) {
      await db.clearTenantContext(client).catch(() => undefined);
      client.release();
    }
  }
});

router.get('/export/notifications/rules/:id', async (req: Request, res: Response, next: NextFunction) => {
  let client: PoolClient | null = null;
  try {
    await ensureConfigPackageSchema();
    client = await db.getClient();
    await setRequestTenantContext(client, req);
    await backfillExternalKeys(client, req.user!.tenant_id);
    const rule = await exportNotificationRule(client, req.user!.tenant_id, String(req.params.id));
    if (!rule) throw BadRequest('Notification rule not found');
    const bundle = emptyBundle(`Notification rule: ${rule.name}`, req.user!.tenant_id);
    bundle.contents.notifications.rules.push(rule);
    res.json({ package: bundle, checksum: checksumBundle(bundle) });
  } catch (err) {
    next(err);
  } finally {
    if (client) {
      await db.clearTenantContext(client).catch(() => undefined);
      client.release();
    }
  }
});

router.get('/export/notifications', async (req: Request, res: Response, next: NextFunction) => {
  let client: PoolClient | null = null;
  try {
    await ensureConfigPackageSchema();
    client = await db.getClient();
    await setRequestTenantContext(client, req);
    const tenantId = req.user!.tenant_id;
    await backfillExternalKeys(client, tenantId);
    const ruleIds = await client.query<{ id: string }>(
      `SELECT id FROM notification_rules
       WHERE tenant_id = $1
       ORDER BY sort_order, name`,
      [tenantId],
    );
    const bundle = emptyBundle('Notification configuration', tenantId);
    for (const row of ruleIds.rows) {
      const rule = await exportNotificationRule(client, tenantId, row.id);
      if (rule) bundle.contents.notifications.rules.push(rule);
    }
    res.json({ package: bundle, checksum: checksumBundle(bundle) });
  } catch (err) {
    next(err);
  } finally {
    if (client) {
      await db.clearTenantContext(client).catch(() => undefined);
      client.release();
    }
  }
});

router.get('/export/data-sources/sources/:id', async (req: Request, res: Response, next: NextFunction) => {
  let client: PoolClient | null = null;
  try {
    await ensureConfigPackageSchema();
    client = await db.getClient();
    await setRequestTenantContext(client, req);
    await backfillExternalKeys(client, req.user!.tenant_id);
    const source = await exportDataSource(client, req.user!.tenant_id, String(req.params.id));
    if (!source) throw BadRequest('Data source not found');
    const bundle = emptyBundle(`Data source: ${source.name}`, req.user!.tenant_id);
    bundle.contents.data_sources.sources.push(source);
    res.json({ package: bundle, checksum: checksumBundle(bundle) });
  } catch (err) {
    next(err);
  } finally {
    if (client) {
      await db.clearTenantContext(client).catch(() => undefined);
      client.release();
    }
  }
});

router.get('/export/data-sources', async (req: Request, res: Response, next: NextFunction) => {
  let client: PoolClient | null = null;
  try {
    await ensureConfigPackageSchema();
    client = await db.getClient();
    await setRequestTenantContext(client, req);
    const tenantId = req.user!.tenant_id;
    await backfillExternalKeys(client, tenantId);
    const sourceIds = await client.query<{ id: string }>(
      `SELECT id FROM data_sources
       WHERE tenant_id = $1
       ORDER BY name`,
      [tenantId],
    );
    const bundle = emptyBundle('Data source configuration', tenantId);
    for (const row of sourceIds.rows) {
      const source = await exportDataSource(client, tenantId, row.id);
      if (source) bundle.contents.data_sources.sources.push(source);
    }
    res.json({ package: bundle, checksum: checksumBundle(bundle) });
  } catch (err) {
    next(err);
  } finally {
    if (client) {
      await db.clearTenantContext(client).catch(() => undefined);
      client.release();
    }
  }
});

router.post('/validate', async (req: Request, res: Response, next: NextFunction) => {
  let client: PoolClient | null = null;
  try {
    await ensureConfigPackageSchema();
    const bundle = readPackageBody(req.body);
    client = await db.getClient();
    await setRequestTenantContext(client, req);
    await backfillExternalKeys(client, req.user!.tenant_id);
    const report = await validateBundle(client, req.user!.tenant_id, bundle);
    const runId = await recordDeploymentRun({
      tenantId: req.user!.tenant_id,
      actorUserId: req.user!.id,
      bundle,
      dryRun: true,
      status: report.valid ? 'validated' : 'failed',
      summary: report.summary,
      result: report,
    });
    res.json({ validation: report, run_id: runId, checksum: checksumBundle(bundle) });
  } catch (err) {
    next(err);
  } finally {
    if (client) {
      await db.clearTenantContext(client).catch(() => undefined);
      client.release();
    }
  }
});

router.post('/apply', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bundle = readPackageBody(req.body);
    const outcome = await validateAndApplyConfigPackage({
      tenantId: req.user!.tenant_id,
      actorUserId: req.user!.id,
      roles: req.user!.roles,
      bundle,
    });
    if (!outcome.success) {
      res.status(400).json(outcome);
      return;
    }
    await recordAuditEvent({
      tenantId: req.user!.tenant_id,
      actorUserId: req.user!.id,
      category: 'config_deployment',
      action: 'apply_config_package',
      level: 'info',
      clientIp: getClientIp(req),
      metadata: {
        run_id: outcome.run_id,
        package_name: bundle.name,
        checksum: checksumBundle(bundle),
        applied: outcome.applied,
      },
    });
    res.json(outcome);
  } catch (err) {
    next(err);
  }
});

router.get('/runs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureConfigPackageSchema();
    const limitRaw = Number.parseInt(String(req.query.limit || '50'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 50;
    const rows = await db.withTenantTransaction(
      req.user!.tenant_id,
      req.user!.id,
      req.user!.roles.join(','),
      async (client) => {
        const result = await client.query(
          `SELECT cdr.*, u.display_name AS actor_name
           FROM config_deployment_runs cdr
           LEFT JOIN users u ON u.id = cdr.actor_user_id
           WHERE cdr.tenant_id = $1
           ORDER BY cdr.created_at DESC
           LIMIT $2`,
          [req.user!.tenant_id, limit],
        );
        return result.rows;
      },
    );
    res.json({ runs: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
