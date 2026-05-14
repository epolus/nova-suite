/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { db } from '../../data/db';
import { authenticate, requireRole } from '../../middleware/auth';
import { BadRequest } from '../../middleware/errorHandler';
import { config } from '../../config';
import { recordAuditEvent } from '../../audit/events';
import {
  configPackageBundleSchema,
  configPackageApplySchema,
} from '../../domain/schemas';
import {
  collectCredentialSlugsFromAutomationConfig,
  validateAndParseAutomationConfig,
} from '../catalog/automation-config';

const router = Router();

type ConfigPackageBundle = z.infer<typeof configPackageBundleSchema>;
type ConfigPackageCategory = ConfigPackageBundle['contents']['catalog']['categories'][number];
type ConfigPackageServiceItem = ConfigPackageBundle['contents']['catalog']['service_items'][number];
type ConfigPackageCatalogTask = ConfigPackageServiceItem['tasks'][number];
type ConfigPackageNotificationRule = ConfigPackageBundle['contents']['notifications']['rules'][number];

type ValidationIssue = {
  severity: 'error' | 'warning';
  path: string;
  message: string;
};

type PackageChange = {
  type: 'category' | 'service_item' | 'catalog_task' | 'notification_rule';
  external_key: string;
  name: string;
  action: 'create' | 'update' | 'skip';
};

type ValidationReport = {
  valid: boolean;
  issues: ValidationIssue[];
  changes: PackageChange[];
  summary: {
    create: number;
    update: number;
    skip: number;
    errors: number;
    warnings: number;
  };
};

type ApplyResult = {
  success: boolean;
  run_id: string | null;
  dry_run: ValidationReport;
  applied: {
    categories: number;
    service_items: number;
    catalog_tasks: number;
    notification_rules: number;
  };
};

let schemaReady: Promise<void> | null = null;

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return normalized || 'item';
}

function makeExternalKey(prefix: string, name: string, id: string): string {
  return `${prefix}/${slugify(name)}-${id.replace(/-/g, '').slice(0, 10)}`;
}

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

function checksumBundle(bundle: ConfigPackageBundle): string {
  return crypto.createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
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
    },
  };
}

async function ensureConfigPackageSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.query('ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS external_key text');
      await db.query('ALTER TABLE service_items ADD COLUMN IF NOT EXISTS external_key text');
      await db.query('ALTER TABLE catalog_tasks ADD COLUMN IF NOT EXISTS external_key text');
      await db.query('ALTER TABLE notification_rules ADD COLUMN IF NOT EXISTS external_key text');
      await db.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_service_categories_tenant_external_key ON service_categories(tenant_id, external_key)',
      );
      await db.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_service_items_tenant_external_key ON service_items(tenant_id, external_key)',
      );
      await db.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_tasks_tenant_external_key ON catalog_tasks(tenant_id, external_key)',
      );
      await db.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_rules_tenant_external_key ON notification_rules(tenant_id, external_key)',
      );
      await db.query(`
        CREATE TABLE IF NOT EXISTS config_deployment_runs (
          id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          actor_user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
          package_name     text NOT NULL,
          package_checksum text NOT NULL,
          source_metadata  jsonb NOT NULL DEFAULT '{}'::jsonb,
          dry_run          boolean NOT NULL DEFAULT false,
          status           text NOT NULL CHECK (status IN ('validated', 'applied', 'failed')),
          summary          jsonb NOT NULL DEFAULT '{}'::jsonb,
          result           jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at       timestamptz NOT NULL DEFAULT now(),
          applied_at       timestamptz
        )
      `);
      await db.query(
        'CREATE INDEX IF NOT EXISTS idx_config_deployment_runs_tenant_created ON config_deployment_runs(tenant_id, created_at DESC)',
      );
      await db.query('ALTER TABLE config_deployment_runs ENABLE ROW LEVEL SECURITY');
      await db.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = current_schema()
              AND tablename = 'config_deployment_runs'
              AND policyname = 'tenant_isolation_config_deployment_runs'
          ) THEN
            CREATE POLICY tenant_isolation_config_deployment_runs ON config_deployment_runs
              FOR ALL USING (tenant_id = current_tenant_id())
              WITH CHECK (tenant_id = current_tenant_id());
          END IF;
        END $$;
      `);
      await db.query('ALTER TABLE config_deployment_runs FORCE ROW LEVEL SECURITY');
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

async function backfillExternalKeys(client: PoolClient, tenantId: string): Promise<void> {
  const categories = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM service_categories
     WHERE tenant_id = $1 AND external_key IS NULL`,
    [tenantId],
  );
  for (const row of categories.rows) {
    await client.query(
      `UPDATE service_categories
       SET external_key = $1
       WHERE tenant_id = $2 AND id = $3 AND external_key IS NULL`,
      [makeExternalKey('catalog-category', row.name, row.id), tenantId, row.id],
    );
  }

  const items = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM service_items
     WHERE tenant_id = $1 AND external_key IS NULL`,
    [tenantId],
  );
  for (const row of items.rows) {
    await client.query(
      `UPDATE service_items
       SET external_key = $1
       WHERE tenant_id = $2 AND id = $3 AND external_key IS NULL`,
      [makeExternalKey('service-item', row.name, row.id), tenantId, row.id],
    );
  }

  const tasks = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM catalog_tasks
     WHERE tenant_id = $1 AND external_key IS NULL`,
    [tenantId],
  );
  for (const row of tasks.rows) {
    await client.query(
      `UPDATE catalog_tasks
       SET external_key = $1
       WHERE tenant_id = $2 AND id = $3 AND external_key IS NULL`,
      [makeExternalKey('catalog-task', row.name, row.id), tenantId, row.id],
    );
  }

  const rules = await client.query<{
    id: string;
    name: string;
    entity_type: string;
    trigger_key: string;
    recipient_type: string;
  }>(
    `SELECT id, name, entity_type, trigger_key, recipient_type
     FROM notification_rules
     WHERE tenant_id = $1 AND external_key IS NULL`,
    [tenantId],
  );
  for (const row of rules.rows) {
    const logicalName = `${row.entity_type}-${row.trigger_key}-${row.recipient_type}-${row.name}`;
    await client.query(
      `UPDATE notification_rules
       SET external_key = $1
       WHERE tenant_id = $2 AND id = $3 AND external_key IS NULL`,
      [makeExternalKey('notification-rule', logicalName, row.id), tenantId, row.id],
    );
  }
}

async function loadPicture(storageKey: string | null): Promise<ConfigPackageServiceItem['picture']> {
  if (!storageKey) return null;
  const fullPath = path.join(config.uploads.dir, storageKey);
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
    channels: Array<'in_app' | 'email'>;
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

function summarize(changes: PackageChange[], issues: ValidationIssue[]): ValidationReport['summary'] {
  return {
    create: changes.filter((change) => change.action === 'create').length,
    update: changes.filter((change) => change.action === 'update').length,
    skip: changes.filter((change) => change.action === 'skip').length,
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
  };
}

function addDuplicateKeyIssues(
  issues: ValidationIssue[],
  entries: Array<{ external_key: string }>,
  type: string,
  pathPrefix: string,
) {
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    if (seen.has(entry.external_key)) {
      issues.push({
        severity: 'error',
        path: `${pathPrefix}.${index}.external_key`,
        message: `Duplicate ${type} external_key "${entry.external_key}" in package`,
      });
    }
    seen.add(entry.external_key);
  });
}

function collectEnvRefsFromObject(value: unknown, refs = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/\{\{env\.([A-Z0-9_]+)\}\}/g)) {
      refs.add(match[1]);
    }
  } else if (Array.isArray(value)) {
    value.forEach((entry) => collectEnvRefsFromObject(entry, refs));
  } else if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((entry) => collectEnvRefsFromObject(entry, refs));
  }
  return refs;
}

async function existsByExternalKey(
  client: PoolClient,
  table: string,
  tenantId: string,
  externalKey: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM ${table} WHERE tenant_id = $1 AND external_key = $2 LIMIT 1`,
    [tenantId, externalKey],
  );
  return result.rows.length > 0;
}

async function findAssignmentGroupId(client: PoolClient, tenantId: string, name: string): Promise<string | null> {
  const row = await client.query<{ id: string }>(
    `SELECT id FROM assignment_groups
     WHERE tenant_id = $1 AND lower(name) = lower($2)
     LIMIT 1`,
    [tenantId, name],
  );
  return row.rows[0]?.id || null;
}

async function findUserIdByEmail(client: PoolClient, tenantId: string, email: string): Promise<string | null> {
  const row = await client.query<{ id: string }>(
    `SELECT id FROM users
     WHERE tenant_id = $1 AND lower(email) = lower($2)
     LIMIT 1`,
    [tenantId, email],
  );
  return row.rows[0]?.id || null;
}

async function validateBundle(
  client: PoolClient,
  tenantId: string,
  bundle: ConfigPackageBundle,
): Promise<ValidationReport> {
  const issues: ValidationIssue[] = [];
  const changes: PackageChange[] = [];

  if (bundle.schema_version !== config.db.expectedSchemaVersion) {
    issues.push({
      severity: 'error',
      path: 'schema_version',
      message: `Package schema version ${bundle.schema_version} does not match target ${config.db.expectedSchemaVersion}`,
    });
  }

  addDuplicateKeyIssues(
    issues,
    bundle.contents.catalog.categories,
    'category',
    'contents.catalog.categories',
  );
  addDuplicateKeyIssues(
    issues,
    bundle.contents.catalog.service_items,
    'service item',
    'contents.catalog.service_items',
  );
  addDuplicateKeyIssues(
    issues,
    bundle.contents.notifications.rules,
    'notification rule',
    'contents.notifications.rules',
  );

  const packagedCategoryKeys = new Set(bundle.contents.catalog.categories.map((category) => category.external_key));

  for (const category of bundle.contents.catalog.categories) {
    changes.push({
      type: 'category',
      external_key: category.external_key,
      name: category.name,
      action: await existsByExternalKey(client, 'service_categories', tenantId, category.external_key) ? 'update' : 'create',
    });
  }

  for (const [itemIndex, item] of bundle.contents.catalog.service_items.entries()) {
    if (!packagedCategoryKeys.has(item.category_external_key)) {
      const existingCategory = await existsByExternalKey(
        client,
        'service_categories',
        tenantId,
        item.category_external_key,
      );
      if (!existingCategory) {
        issues.push({
          severity: 'error',
          path: `contents.catalog.service_items.${itemIndex}.category_external_key`,
          message: `Missing category "${item.category_external_key}" on target`,
        });
      }
    }
    if (item.picture) {
      const pictureBuffer = Buffer.from(item.picture.base64, 'base64');
      const actualSha = crypto.createHash('sha256').update(pictureBuffer).digest('hex');
      if (actualSha !== item.picture.sha256) {
        issues.push({
          severity: 'error',
          path: `contents.catalog.service_items.${itemIndex}.picture.sha256`,
          message: `Picture checksum mismatch for "${item.name}"`,
        });
      }
    }

    changes.push({
      type: 'service_item',
      external_key: item.external_key,
      name: item.name,
      action: await existsByExternalKey(client, 'service_items', tenantId, item.external_key) ? 'update' : 'create',
    });

    addDuplicateKeyIssues(
      issues,
      item.tasks,
      'catalog task',
      `contents.catalog.service_items.${itemIndex}.tasks`,
    );

    for (const [taskIndex, task] of item.tasks.entries()) {
      if (task.assigned_group_name) {
        const groupId = await findAssignmentGroupId(client, tenantId, task.assigned_group_name);
        if (!groupId) {
          issues.push({
            severity: 'error',
            path: `contents.catalog.service_items.${itemIndex}.tasks.${taskIndex}.assigned_group_name`,
            message: `Missing assignment group "${task.assigned_group_name}" on target`,
          });
        }
      }
      if (task.task_type === 'automated') {
        const { errors } = validateAndParseAutomationConfig(task.automation_config);
        if (errors.length > 0) {
          issues.push({
            severity: 'error',
            path: `contents.catalog.service_items.${itemIndex}.tasks.${taskIndex}.automation_config`,
            message: errors.join('; '),
          });
        }
      }
      const credentialSlugs = collectCredentialSlugsFromAutomationConfig(task.automation_config);
      if (credentialSlugs.length > 0) {
        const found = await client.query<{ slug: string }>(
          `SELECT slug FROM tenant_credentials
           WHERE tenant_id = $1 AND slug = ANY($2::text[])`,
          [tenantId, credentialSlugs],
        );
        const existing = new Set(found.rows.map((row) => row.slug));
        const missing = credentialSlugs.filter((slug) => !existing.has(slug));
        if (missing.length > 0) {
          issues.push({
            severity: 'error',
            path: `contents.catalog.service_items.${itemIndex}.tasks.${taskIndex}.automation_config`,
            message: `Missing credential slug(s) on target: ${missing.join(', ')}`,
          });
        }
      }
      const missingEnv = [...collectEnvRefsFromObject(task.automation_config)]
        .filter((envName) => process.env[envName] === undefined);
      if (missingEnv.length > 0) {
        issues.push({
          severity: 'warning',
          path: `contents.catalog.service_items.${itemIndex}.tasks.${taskIndex}.automation_config`,
          message: `Target process is missing environment variable(s): ${missingEnv.join(', ')}`,
        });
      }
      changes.push({
        type: 'catalog_task',
        external_key: task.external_key,
        name: task.name,
        action: await existsByExternalKey(client, 'catalog_tasks', tenantId, task.external_key) ? 'update' : 'create',
      });
    }
  }

  for (const [ruleIndex, rule] of bundle.contents.notifications.rules.entries()) {
    if (rule.recipient_type === 'specific_user' && !rule.recipient_user_email) {
      issues.push({
        severity: 'error',
        path: `contents.notifications.rules.${ruleIndex}.recipient_user_email`,
        message: 'recipient_user_email is required for specific_user notification rules',
      });
    }
    if (rule.recipient_user_email) {
      const userId = await findUserIdByEmail(client, tenantId, rule.recipient_user_email);
      if (!userId) {
        issues.push({
          severity: 'error',
          path: `contents.notifications.rules.${ruleIndex}.recipient_user_email`,
          message: `Missing user "${rule.recipient_user_email}" on target`,
        });
      }
    }
    if (rule.recipient_type === 'assignment_group_members' && !rule.recipient_group_name) {
      issues.push({
        severity: 'error',
        path: `contents.notifications.rules.${ruleIndex}.recipient_group_name`,
        message: 'recipient_group_name is required for assignment_group_members notification rules',
      });
    }
    if (rule.recipient_group_name) {
      const groupId = await findAssignmentGroupId(client, tenantId, rule.recipient_group_name);
      if (!groupId) {
        issues.push({
          severity: 'error',
          path: `contents.notifications.rules.${ruleIndex}.recipient_group_name`,
          message: `Missing assignment group "${rule.recipient_group_name}" on target`,
        });
      }
    }
    if (rule.channels.includes('email')) {
      for (const [templateIndex, template] of rule.templates.entries()) {
        if (!template.body_template || !template.body_template.trim()) {
          issues.push({
            severity: 'error',
            path: `contents.notifications.rules.${ruleIndex}.templates.${templateIndex}.body_template`,
            message: 'body_template is required when email channel is enabled',
          });
        }
      }
    }
    changes.push({
      type: 'notification_rule',
      external_key: rule.external_key,
      name: rule.name,
      action: await existsByExternalKey(client, 'notification_rules', tenantId, rule.external_key) ? 'update' : 'create',
    });
  }

  const summary = summarize(changes, issues);
  return {
    valid: summary.errors === 0,
    issues,
    changes,
    summary,
  };
}

async function recordDeploymentRun(args: {
  tenantId: string;
  actorUserId: string;
  bundle: ConfigPackageBundle;
  dryRun: boolean;
  status: 'validated' | 'applied' | 'failed';
  summary: Record<string, unknown>;
  result: Record<string, unknown>;
}): Promise<string> {
  const row = await db.withTenantTransaction(
    args.tenantId,
    args.actorUserId,
    'admin',
    async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO config_deployment_runs (
           tenant_id, actor_user_id, package_name, package_checksum, source_metadata,
           dry_run, status, summary, result, applied_at
         ) VALUES (
           $1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9::jsonb,
           CASE WHEN $7 = 'applied' THEN now() ELSE NULL END
         )
         RETURNING id`,
        [
          args.tenantId,
          args.actorUserId,
          args.bundle.name,
          checksumBundle(args.bundle),
          JSON.stringify(args.bundle.source),
          args.dryRun,
          args.status,
          JSON.stringify(args.summary),
          JSON.stringify(args.result),
        ],
      );
      return result.rows[0];
    },
  );
  return row!.id;
}

async function upsertCategory(
  client: PoolClient,
  tenantId: string,
  category: ConfigPackageCategory,
): Promise<string> {
  const row = await client.query<{ id: string }>(
    `INSERT INTO service_categories (
       tenant_id, external_key, name, description, icon, sort_order, is_active
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7
     )
     ON CONFLICT (tenant_id, external_key) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       icon = EXCLUDED.icon,
       sort_order = EXCLUDED.sort_order,
       is_active = EXCLUDED.is_active,
       updated_at = now()
     RETURNING id`,
    [
      tenantId,
      category.external_key,
      category.name,
      category.description || null,
      category.icon || 'folder',
      category.sort_order,
      category.is_active,
    ],
  );
  return row.rows[0].id;
}

async function writePicture(
  client: PoolClient,
  itemId: string,
  picture: NonNullable<ConfigPackageServiceItem['picture']>,
): Promise<void> {
  const buffer = Buffer.from(picture.base64, 'base64');
  const actualSha = crypto.createHash('sha256').update(buffer).digest('hex');
  if (actualSha !== picture.sha256) {
    throw BadRequest(`Picture checksum mismatch for ${picture.file_name}`);
  }

  const ext = path.extname(picture.file_name) || '.bin';
  const storageKey = `catalog/${itemId}/${crypto.randomUUID()}${ext}`;
  const fullPath = path.join(config.uploads.dir, storageKey);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, buffer);

  const old = await client.query<{ picture_storage_key: string | null }>(
    'SELECT picture_storage_key FROM service_items WHERE id = $1',
    [itemId],
  );
  const oldKey = old.rows[0]?.picture_storage_key;
  if (oldKey) {
    try {
      fs.unlinkSync(path.join(config.uploads.dir, oldKey));
    } catch {
      // Best effort cleanup; stale blobs should not fail a deployment.
    }
  }
  await client.query(
    'UPDATE service_items SET picture_storage_key = $1, updated_at = now() WHERE id = $2',
    [storageKey, itemId],
  );
}

async function upsertServiceItem(
  client: PoolClient,
  tenantId: string,
  item: ConfigPackageServiceItem,
  categoryId: string,
): Promise<string> {
  const row = await client.query<{ id: string }>(
    `INSERT INTO service_items (
       tenant_id, external_key, category_id, name, short_description, description,
       icon, price, custom_attributes, form_schema, approval_required, sla_hours, is_active
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13
     )
     ON CONFLICT (tenant_id, external_key) DO UPDATE SET
       category_id = EXCLUDED.category_id,
       name = EXCLUDED.name,
       short_description = EXCLUDED.short_description,
       description = EXCLUDED.description,
       icon = EXCLUDED.icon,
       price = EXCLUDED.price,
       custom_attributes = EXCLUDED.custom_attributes,
       form_schema = EXCLUDED.form_schema,
       approval_required = EXCLUDED.approval_required,
       sla_hours = EXCLUDED.sla_hours,
       is_active = EXCLUDED.is_active,
       updated_at = now()
     RETURNING id`,
    [
      tenantId,
      item.external_key,
      categoryId,
      item.name,
      item.short_description || null,
      item.description || null,
      item.icon || 'box',
      item.price ?? null,
      JSON.stringify(item.custom_attributes || {}),
      JSON.stringify(item.form_schema || { fields: [] }),
      item.approval_required,
      item.sla_hours || 72,
      item.is_active,
    ],
  );
  return row.rows[0].id;
}

async function upsertCatalogTask(
  client: PoolClient,
  tenantId: string,
  serviceItemId: string,
  task: ConfigPackageCatalogTask,
): Promise<string> {
  const assignedGroupId = task.assigned_group_name
    ? await findAssignmentGroupId(client, tenantId, task.assigned_group_name)
    : null;
  const row = await client.query<{ id: string }>(
    `INSERT INTO catalog_tasks (
       tenant_id, external_key, service_item_id, name, description, instructions,
       task_type, task_order, assigned_group_id, sla_hours, automation_config, is_active
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12
     )
     ON CONFLICT (tenant_id, external_key) DO UPDATE SET
       service_item_id = EXCLUDED.service_item_id,
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       instructions = EXCLUDED.instructions,
       task_type = EXCLUDED.task_type,
       task_order = EXCLUDED.task_order,
       assigned_group_id = EXCLUDED.assigned_group_id,
       sla_hours = EXCLUDED.sla_hours,
       automation_config = EXCLUDED.automation_config,
       is_active = EXCLUDED.is_active,
       updated_at = now()
     RETURNING id`,
    [
      tenantId,
      task.external_key,
      serviceItemId,
      task.name,
      task.description || null,
      task.instructions || null,
      task.task_type,
      task.task_order,
      assignedGroupId,
      task.sla_hours ?? null,
      JSON.stringify(task.automation_config || {}),
      task.is_active,
    ],
  );
  return row.rows[0].id;
}

async function upsertNotificationRule(
  client: PoolClient,
  tenantId: string,
  rule: ConfigPackageNotificationRule,
): Promise<string> {
  const recipientUserId = rule.recipient_user_email
    ? await findUserIdByEmail(client, tenantId, rule.recipient_user_email)
    : null;
  const recipientGroupId = rule.recipient_group_name
    ? await findAssignmentGroupId(client, tenantId, rule.recipient_group_name)
    : null;
  const defaultTemplate = rule.templates.find((template) => template.locale === 'en') || rule.templates[0];
  const row = await client.query<{ id: string }>(
    `INSERT INTO notification_rules (
       tenant_id, external_key, name, description, entity_type, trigger_key, recipient_type,
       recipient_user_id, recipient_group_id, channels, title_template, body_template,
       is_active, sort_order
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11, $12, $13, $14
     )
     ON CONFLICT (tenant_id, external_key) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       entity_type = EXCLUDED.entity_type,
       trigger_key = EXCLUDED.trigger_key,
       recipient_type = EXCLUDED.recipient_type,
       recipient_user_id = EXCLUDED.recipient_user_id,
       recipient_group_id = EXCLUDED.recipient_group_id,
       channels = EXCLUDED.channels,
       title_template = EXCLUDED.title_template,
       body_template = EXCLUDED.body_template,
       is_active = EXCLUDED.is_active,
       sort_order = EXCLUDED.sort_order,
       updated_at = now()
     RETURNING id`,
    [
      tenantId,
      rule.external_key,
      rule.name,
      rule.description || null,
      rule.entity_type,
      rule.trigger_key,
      rule.recipient_type,
      recipientUserId,
      recipientGroupId,
      rule.channels,
      defaultTemplate.title_template,
      defaultTemplate.body_template || null,
      rule.is_active,
      rule.sort_order,
    ],
  );
  const ruleId = row.rows[0].id;
  await client.query(
    `DELETE FROM notification_rule_templates
     WHERE tenant_id = $1 AND notification_rule_id = $2`,
    [tenantId, ruleId],
  );
  for (const template of rule.templates) {
    await client.query(
      `INSERT INTO notification_rule_templates (
         tenant_id, notification_rule_id, locale, title_template, body_template, body_html_template
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tenantId,
        ruleId,
        template.locale,
        template.title_template,
        template.body_template || null,
        template.body_html_template || null,
      ],
    );
  }
  return ruleId;
}

async function applyBundle(
  tenantId: string,
  userId: string,
  roles: string[],
  bundle: ConfigPackageBundle,
  dryRun: ValidationReport,
): Promise<ApplyResult['applied']> {
  return db.withTenantTransaction(tenantId, userId, roles.join(','), async (client) => {
    const categoryIds = new Map<string, string>();
    for (const category of bundle.contents.catalog.categories) {
      const id = await upsertCategory(client, tenantId, category);
      categoryIds.set(category.external_key, id);
    }

    const applied = {
      categories: bundle.contents.catalog.categories.length,
      service_items: 0,
      catalog_tasks: 0,
      notification_rules: 0,
    };

    for (const item of bundle.contents.catalog.service_items) {
      let categoryId = categoryIds.get(item.category_external_key);
      if (!categoryId) {
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM service_categories
           WHERE tenant_id = $1 AND external_key = $2
           LIMIT 1`,
          [tenantId, item.category_external_key],
        );
        categoryId = existing.rows[0]?.id;
      }
      if (!categoryId) throw BadRequest(`Missing category "${item.category_external_key}"`);
      const itemId = await upsertServiceItem(client, tenantId, item, categoryId);
      applied.service_items += 1;
      if (item.picture) await writePicture(client, itemId, item.picture);
      for (const task of item.tasks) {
        await upsertCatalogTask(client, tenantId, itemId, task);
        applied.catalog_tasks += 1;
      }
    }

    for (const rule of bundle.contents.notifications.rules) {
      await upsertNotificationRule(client, tenantId, rule);
      applied.notification_rules += 1;
    }

    // Touch the validation object so future maintainers see apply is gated by it.
    if (!dryRun.valid) throw BadRequest('Cannot apply an invalid configuration package');
    return applied;
  });
}

router.use(authenticate, requireRole('admin'));

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
    client?.release();
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
    client?.release();
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
    client?.release();
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
    client?.release();
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
    client?.release();
  }
});

router.post('/apply', async (req: Request, res: Response, next: NextFunction) => {
  let client: PoolClient | null = null;
  try {
    await ensureConfigPackageSchema();
    const bundle = readPackageBody(req.body);
    client = await db.getClient();
    await setRequestTenantContext(client, req);
    await backfillExternalKeys(client, req.user!.tenant_id);
    const report = await validateBundle(client, req.user!.tenant_id, bundle);
    client.release();
    client = null;
    if (!report.valid) {
      const runId = await recordDeploymentRun({
        tenantId: req.user!.tenant_id,
        actorUserId: req.user!.id,
        bundle,
        dryRun: false,
        status: 'failed',
        summary: report.summary,
        result: report,
      });
      res.status(400).json({ success: false, run_id: runId, dry_run: report });
      return;
    }

    const applied = await applyBundle(req.user!.tenant_id, req.user!.id, req.user!.roles, bundle, report);
    const result: ApplyResult = {
      success: true,
      run_id: null,
      dry_run: report,
      applied,
    };
    const runId = await recordDeploymentRun({
      tenantId: req.user!.tenant_id,
      actorUserId: req.user!.id,
      bundle,
      dryRun: false,
      status: 'applied',
      summary: { ...report.summary, applied },
      result,
    });
    result.run_id = runId;
    await recordAuditEvent({
      tenantId: req.user!.tenant_id,
      actorUserId: req.user!.id,
      category: 'config_deployment',
      action: 'apply_config_package',
      level: 'info',
      metadata: {
        run_id: runId,
        package_name: bundle.name,
        checksum: checksumBundle(bundle),
        applied,
      },
    });
    res.json(result);
  } catch (err) {
    next(err);
  } finally {
    client?.release();
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
