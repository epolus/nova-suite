/* SPDX-License-Identifier: AGPL-3.0-only */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { db } from '../../data/db';
import { BadRequest } from '../../middleware/errorHandler';
import { config } from '../../config';
import { assertUuidParam, resolveUploadPath, safeImageExtension } from '../../data/upload-path';
import { configPackageBundleSchema } from '../../domain/schemas';
import { parseFulfillmentModelConfig } from '@nova-suite/shared';
import {
  collectCredentialSlugsFromAutomationConfig,
  validateAndParseAutomationConfig,
} from '../catalog/automation-config';
import { ENTITY_DEFS } from '../import/entity-defs';
import { cancelDataSourceSchedule } from '../../temporal/workflows';
import { enqueueDataSourceScheduleStartJob } from '../../temporal/workflow-start-queue';

export type ConfigPackageBundle = z.infer<typeof configPackageBundleSchema>;
export type ConfigPackageCategory = ConfigPackageBundle['contents']['catalog']['categories'][number];
export type ConfigPackageServiceItem = ConfigPackageBundle['contents']['catalog']['service_items'][number];
export type ConfigPackageCatalogTask = ConfigPackageServiceItem['tasks'][number];
export type ConfigPackageFulfillmentModel = ConfigPackageBundle['contents']['catalog']['fulfillment_models'][number];
export type ConfigPackageNotificationRule = ConfigPackageBundle['contents']['notifications']['rules'][number];
export type ConfigPackageDataSource = ConfigPackageBundle['contents']['data_sources']['sources'][number];

export type ValidationIssue = {
  severity: 'error' | 'warning';
  path: string;
  message: string;
};

export type PackageChange = {
  type: 'category' | 'fulfillment_model' | 'service_item' | 'catalog_task' | 'notification_rule' | 'data_source' | 'workflow_definition';
  external_key: string;
  name: string;
  action: 'create' | 'update' | 'skip';
};

export type ValidationReport = {
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

export type ApplyResult = {
  success: boolean;
  run_id: string | null;
  dry_run: ValidationReport;
  applied: {
    categories: number;
    fulfillment_models: number;
    service_items: number;
    catalog_tasks: number;
    notification_rules: number;
    data_sources: number;
    workflow_definitions: number;
  };
};

export type ConfigPackageWorkflowDefinition = ConfigPackageBundle['contents']['workflows']['definitions'][number];

export const DATA_SOURCE_SECRET_KEYS = [
  'bearer_token',
  'basic_password',
  'oauth2_client_secret',
  'sftp_password',
  'sftp_private_key',
] as const;

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

export function makeExternalKey(prefix: string, name: string, id: string): string {
  return `${prefix}/${slugify(name)}-${id.replace(/-/g, '').slice(0, 10)}`;
}

export function checksumBundle(bundle: ConfigPackageBundle): string {
  return crypto.createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
}

function isInsufficientPrivilege(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err
    && String((err as { code: unknown }).code) === '42501';
}

export async function ensureConfigPackageSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      // DDL is owned by the bootstrap superuser. nova_runtime cannot ALTER TABLE;
      // columns already exist on current schema — treat permission errors as no-op.
      try {
      await db.query('ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS external_key text');
      await db.query('ALTER TABLE service_items ADD COLUMN IF NOT EXISTS external_key text');
      await db.query('ALTER TABLE catalog_tasks ADD COLUMN IF NOT EXISTS external_key text');
      await db.query('ALTER TABLE fulfillment_models ADD COLUMN IF NOT EXISTS external_key text');
      await db.query('ALTER TABLE notification_rules ADD COLUMN IF NOT EXISTS external_key text');
      await db.query('ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS external_key text');
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
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_fulfillment_models_tenant_external_key ON fulfillment_models(tenant_id, external_key)',
      );
      await db.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_rules_tenant_external_key ON notification_rules(tenant_id, external_key)',
      );
      await db.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_data_sources_tenant_external_key ON data_sources(tenant_id, external_key)',
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
      } catch (err) {
        if (!isInsufficientPrivilege(err)) throw err;
      }
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

export async function backfillExternalKeys(client: PoolClient, tenantId: string): Promise<void> {
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

  const models = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM fulfillment_models
     WHERE tenant_id = $1 AND external_key IS NULL`,
    [tenantId],
  );
  for (const row of models.rows) {
    await client.query(
      `UPDATE fulfillment_models
       SET external_key = $1
       WHERE tenant_id = $2 AND id = $3 AND external_key IS NULL`,
      [makeExternalKey('fulfillment-model', row.name, row.id), tenantId, row.id],
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

  const dataSources = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM data_sources
     WHERE tenant_id = $1 AND external_key IS NULL`,
    [tenantId],
  );
  for (const row of dataSources.rows) {
    await client.query(
      `UPDATE data_sources
       SET external_key = $1
       WHERE tenant_id = $2 AND id = $3 AND external_key IS NULL`,
      [makeExternalKey('data-source', row.name, row.id), tenantId, row.id],
    );
  }
}

export function sanitizeSourceConfigForExport(sourceConfig: Record<string, unknown>): Record<string, unknown> {
  const next = { ...sourceConfig };
  for (const key of DATA_SOURCE_SECRET_KEYS) {
    delete next[key];
  }
  return next;
}

export function dataSourceNeedsCredentialHint(sourceConfig: Record<string, unknown>): boolean {
  const authType = typeof sourceConfig.auth_type === 'string' ? sourceConfig.auth_type : 'none';
  const credentialSlug = typeof sourceConfig.credential_slug === 'string'
    ? sourceConfig.credential_slug.trim()
    : '';
  if (credentialSlug) return false;
  if (authType === 'bearer' || authType === 'basic' || authType === 'oauth2') return true;
  if (sourceConfig.sftp_host && !sourceConfig.sftp_private_key && !sourceConfig.sftp_password) return true;
  return false;
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

export async function findAssignmentGroupId(client: PoolClient, tenantId: string, name: string): Promise<string | null> {
  const row = await client.query<{ id: string }>(
    `SELECT id FROM assignment_groups
     WHERE tenant_id = $1 AND lower(name) = lower($2)
     LIMIT 1`,
    [tenantId, name],
  );
  return row.rows[0]?.id || null;
}

async function findCiClassId(client: PoolClient, tenantId: string, name: string): Promise<string | null> {
  const row = await client.query<{ id: string }>(
    `SELECT id FROM ci_classes
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

async function missingCalledWorkflowTypes(
  client: PoolClient,
  tenantId: string,
  automationConfig: Record<string, unknown>,
  packaged: Set<string>,
): Promise<string[]> {
  const states = Array.isArray(automationConfig.states) ? automationConfig.states as Array<Record<string, unknown>> : [];
  const called = [...new Set(states
    .filter((s) => s.type === 'call.workflow' && typeof s.workflowType === 'string' && !s.definitionId)
    .map((s) => String(s.workflowType))
    .filter((t) => t && !t.includes('{{') && !packaged.has(t)))];
  if (called.length === 0) return [];
  const found = await client.query<{ workflow_type: string }>(
    `SELECT DISTINCT workflow_type FROM workflow_definitions
     WHERE tenant_id = $1 AND workflow_type = ANY($2::text[]) AND is_active = true AND published_definition IS NOT NULL`,
    [tenantId, called],
  );
  const existing = new Set(found.rows.map((r) => r.workflow_type));
  return called.filter((t) => !existing.has(t));
}

async function upsertWorkflowDefinition(
  client: PoolClient,
  tenantId: string,
  userId: string,
  wf: ConfigPackageWorkflowDefinition,
): Promise<string> {
  const row = await client.query<{ id: string }>(
    `INSERT INTO workflow_definitions (
       tenant_id, name, workflow_type, draft_definition, published_definition,
       version, is_active, draft_updated_at, published_at, published_by, created_by
     ) VALUES ($1, $2, $3, $4::jsonb, $4::jsonb, 1, true, now(), now(), $5, $5)
     ON CONFLICT (tenant_id, workflow_type, name) DO UPDATE SET
       draft_definition = EXCLUDED.draft_definition,
       published_definition = EXCLUDED.published_definition,
       version = workflow_definitions.version + 1,
       is_active = true,
       draft_updated_at = now(),
       published_at = now(),
       published_by = EXCLUDED.published_by
     RETURNING id`,
    [tenantId, wf.name, wf.workflow_type, JSON.stringify(wf.definition), userId],
  );
  return row.rows[0].id;
}

export async function validateBundle(
  client: PoolClient,
  tenantId: string,
  bundle: ConfigPackageBundle,
): Promise<ValidationReport> {
  const issues: ValidationIssue[] = [];
  const changes: PackageChange[] = [];
  const recordExternalKeyChange = async (
    type: PackageChange['type'],
    table: string,
    externalKey: string,
    name: string,
  ) => {
    changes.push({
      type,
      external_key: externalKey,
      name,
      action: await existsByExternalKey(client, table, tenantId, externalKey) ? 'update' : 'create',
    });
  };

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
    bundle.contents.catalog.fulfillment_models,
    'fulfillment model',
    'contents.catalog.fulfillment_models',
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
  addDuplicateKeyIssues(
    issues,
    bundle.contents.data_sources.sources,
    'data source',
    'contents.data_sources.sources',
  );

  const workflowTypes = new Set<string>();
  const seenWorkflows = new Set<string>();
  for (const [index, wf] of bundle.contents.workflows.definitions.entries()) {
    const path = `contents.workflows.definitions.${index}`;
    const key = `${wf.workflow_type}\u0000${wf.name}`;
    if (seenWorkflows.has(key)) {
      issues.push({ severity: 'error', path, message: `Duplicate workflow definition "${wf.name}" (${wf.workflow_type}) in package` });
    }
    seenWorkflows.add(key);
    workflowTypes.add(wf.workflow_type);
    const { errors } = validateAndParseAutomationConfig(wf.definition);
    if (errors.length > 0) issues.push({ severity: 'error', path: `${path}.definition`, message: errors.join('; ') });
    const existing = await client.query(
      `SELECT 1 FROM workflow_definitions WHERE tenant_id = $1 AND workflow_type = $2 AND name = $3 LIMIT 1`,
      [tenantId, wf.workflow_type, wf.name],
    );
    changes.push({
      type: 'workflow_definition',
      external_key: wf.workflow_type,
      name: wf.name,
      action: existing.rows.length > 0 ? 'update' : 'create',
    });
  }

  const packagedCategoryKeys = new Set(bundle.contents.catalog.categories.map((category) => category.external_key));
  const packagedModelKeys = new Set(bundle.contents.catalog.fulfillment_models.map((model) => model.external_key));

  for (const category of bundle.contents.catalog.categories) {
    await recordExternalKeyChange('category', 'service_categories', category.external_key, category.name);
  }

  for (const [modelIndex, model] of bundle.contents.catalog.fulfillment_models.entries()) {
    const path = `contents.catalog.fulfillment_models.${modelIndex}`;
    for (const [taskIndex, task] of model.tasks.entries()) {
      const taskPath = `${path}.tasks.${taskIndex}.assigned_group_name`;
      if (!task.assigned_group_name) {
        issues.push({ severity: 'error', path: taskPath, message: 'Assignment group is required' });
      } else if (!await findAssignmentGroupId(client, tenantId, task.assigned_group_name)) {
        issues.push({
          severity: 'error',
          path: taskPath,
          message: `Missing assignment group "${task.assigned_group_name}" on target`,
        });
      }
    }
    if (model.ci.enabled) {
      if (!model.ci.class_name) {
        issues.push({ severity: 'error', path: `${path}.ci.class_name`, message: 'CI class is required' });
      } else if (!await findCiClassId(client, tenantId, model.ci.class_name)) {
        issues.push({
          severity: 'error',
          path: `${path}.ci.class_name`,
          message: `Missing CI class "${model.ci.class_name}" on target`,
        });
      }
    }
    const runtime = await runtimeConfigFromPackage(client, tenantId, model);
    if (!runtime) {
      issues.push({ severity: 'error', path, message: 'Fulfillment model config is invalid' });
    }
    await recordExternalKeyChange('fulfillment_model', 'fulfillment_models', model.external_key, model.name);
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

    if (item.fulfillment_model_external_key && item.tasks.length > 0) {
      issues.push({
        severity: 'error',
        path: `contents.catalog.service_items.${itemIndex}.fulfillment_model_external_key`,
        message: 'A service item cannot use a fulfillment model and catalog tasks',
      });
    }
    if (item.fulfillment_model_external_key && !packagedModelKeys.has(item.fulfillment_model_external_key)) {
      const modelExists = await existsByExternalKey(
        client,
        'fulfillment_models',
        tenantId,
        item.fulfillment_model_external_key,
      );
      if (!modelExists) {
        issues.push({
          severity: 'error',
          path: `contents.catalog.service_items.${itemIndex}.fulfillment_model_external_key`,
          message: `Missing fulfillment model "${item.fulfillment_model_external_key}" on target`,
        });
      }
    }
    if (item.fulfillment_model_external_key) {
      const existingItem = await client.query<{ id: string }>(
        `SELECT id FROM service_items WHERE tenant_id = $1 AND external_key = $2 LIMIT 1`,
        [tenantId, item.external_key],
      );
      if (existingItem.rows[0]) {
        const taskCount = await client.query<{ count: string }>(
          `SELECT count(*) FROM catalog_tasks WHERE service_item_id = $1`,
          [existingItem.rows[0].id],
        );
        if (parseInt(taskCount.rows[0]?.count || '0', 10) > 0) {
          issues.push({
            severity: 'error',
            path: `contents.catalog.service_items.${itemIndex}.fulfillment_model_external_key`,
            message: 'Service item already has catalog tasks. Remove them before linking a fulfillment model.',
          });
        }
      }
    }

    await recordExternalKeyChange('service_item', 'service_items', item.external_key, item.name);

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
        for (const workflowType of await missingCalledWorkflowTypes(client, tenantId, task.automation_config, workflowTypes)) {
          issues.push({
            severity: 'warning',
            path: `contents.catalog.service_items.${itemIndex}.tasks.${taskIndex}.automation_config`,
            message: `Sub-workflow "${workflowType}" is not in the package or on the target; the call fails at runtime`,
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
      await recordExternalKeyChange('catalog_task', 'catalog_tasks', task.external_key, task.name);
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
    await recordExternalKeyChange('notification_rule', 'notification_rules', rule.external_key, rule.name);
  }

  for (const [sourceIndex, source] of bundle.contents.data_sources.sources.entries()) {
    if (!ENTITY_DEFS[source.entity_type]) {
      issues.push({
        severity: 'error',
        path: `contents.data_sources.sources.${sourceIndex}.entity_type`,
        message: `Unknown entity type "${source.entity_type}" on target`,
      });
    }
    const intuneConnector = source.source_type === 'intune';
    if (!intuneConnector && (source.import_mode === 'upsert' || source.import_mode === 'full_sync') && !source.upsert_key) {
      issues.push({
        severity: 'warning',
        path: `contents.data_sources.sources.${sourceIndex}.upsert_key`,
        message: `Data source "${source.name}" uses ${source.import_mode} without upsert_key`,
      });
    }
    const credentialSlug = typeof source.source_config.credential_slug === 'string'
      ? source.source_config.credential_slug.trim()
      : '';
    if (credentialSlug) {
      const found = await client.query<{ slug: string }>(
        `SELECT slug FROM tenant_credentials
         WHERE tenant_id = $1 AND slug = $2
         LIMIT 1`,
        [tenantId, credentialSlug],
      );
      if (found.rows.length === 0) {
        issues.push({
          severity: 'error',
          path: `contents.data_sources.sources.${sourceIndex}.source_config.credential_slug`,
          message: `Missing credential slug "${credentialSlug}" on target`,
        });
      }
    } else if (dataSourceNeedsCredentialHint(source.source_config)) {
      issues.push({
        severity: 'warning',
        path: `contents.data_sources.sources.${sourceIndex}.source_config`,
        message: `Data source "${source.name}" references auth without credential_slug; inline secrets are not exported and must be configured on the target`,
      });
    }
    await recordExternalKeyChange('data_source', 'data_sources', source.external_key, source.name);
  }

  const summary = summarize(changes, issues);
  return {
    valid: summary.errors === 0,
    issues,
    changes,
    summary,
  };
}

export async function recordDeploymentRun(args: {
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

  const ext = safeImageExtension(picture.file_name, '.bin');
  const storageKey = `catalog/${assertUuidParam(itemId)}/${crypto.randomUUID()}${ext}`;
  const fullPath = resolveUploadPath(config.uploads.dir, storageKey);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, buffer);

  const old = await client.query<{ picture_storage_key: string | null }>(
    'SELECT picture_storage_key FROM service_items WHERE id = $1',
    [itemId],
  );
  const oldKey = old.rows[0]?.picture_storage_key;
  if (oldKey) {
    try {
      fs.unlinkSync(resolveUploadPath(config.uploads.dir, oldKey));
    } catch {
      // Best effort cleanup; stale blobs should not fail a deployment.
    }
  }
  await client.query(
    'UPDATE service_items SET picture_storage_key = $1, updated_at = now() WHERE id = $2',
    [storageKey, itemId],
  );
}

async function runtimeConfigFromPackage(
  client: PoolClient,
  tenantId: string,
  model: ConfigPackageFulfillmentModel,
) {
  const tasks = [];
  for (const task of model.tasks) {
    tasks.push({
      name: task.name,
      instructions: task.instructions,
      assigned_group_id: task.assigned_group_name
        ? await findAssignmentGroupId(client, tenantId, task.assigned_group_name)
        : null,
      sla_hours: task.sla_hours ?? null,
    });
  }
  const classId = model.ci.enabled && model.ci.class_name
    ? await findCiClassId(client, tenantId, model.ci.class_name)
    : null;
  return parseFulfillmentModelConfig({
    tasks,
    ci: {
      enabled: model.ci.enabled,
      class_id: classId,
      name_template: model.ci.name_template,
      display_name_template: model.ci.display_name_template,
      status: model.ci.status,
    },
    asset: {
      enabled: model.asset.enabled,
      category: model.asset.category,
      name_template: model.asset.name_template,
      asset_tag_template: model.asset.asset_tag_template,
    },
  });
}

async function upsertFulfillmentModel(
  client: PoolClient,
  tenantId: string,
  model: ConfigPackageFulfillmentModel,
): Promise<string> {
  const config = await runtimeConfigFromPackage(client, tenantId, model);
  if (!config) throw BadRequest(`Fulfillment model "${model.name}" is invalid`);
  const row = await client.query<{ id: string }>(
    `INSERT INTO fulfillment_models (
       tenant_id, external_key, name, description, config, is_active
     ) VALUES (
       $1, $2, $3, $4, $5::jsonb, $6
     )
     ON CONFLICT (tenant_id, external_key) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       config = EXCLUDED.config,
       is_active = EXCLUDED.is_active,
       updated_at = now()
     RETURNING id`,
    [
      tenantId,
      model.external_key,
      model.name,
      model.description || null,
      JSON.stringify(config),
      model.is_active,
    ],
  );
  return row.rows[0].id;
}

async function upsertServiceItem(
  client: PoolClient,
  tenantId: string,
  item: ConfigPackageServiceItem,
  categoryId: string,
  fulfillmentModelId: string | null,
): Promise<string> {
  const row = await client.query<{ id: string }>(
    `INSERT INTO service_items (
       tenant_id, external_key, category_id, fulfillment_model_id, name, short_description, description,
       icon, price, custom_attributes, form_schema, approval_required, sla_hours, is_active
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14
     )
     ON CONFLICT (tenant_id, external_key) DO UPDATE SET
       category_id = EXCLUDED.category_id,
       fulfillment_model_id = EXCLUDED.fulfillment_model_id,
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
      fulfillmentModelId,
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

async function upsertDataSource(
  client: PoolClient,
  tenantId: string,
  userId: string,
  source: ConfigPackageDataSource,
): Promise<{ id: string; previousScheduleEnabled: boolean }> {
  const existing = await client.query<{
    id: string;
    source_config: Record<string, unknown>;
    schedule_enabled: boolean;
  }>(
    `SELECT id, source_config, schedule_enabled FROM data_sources
     WHERE tenant_id = $1 AND external_key = $2
     LIMIT 1`,
    [tenantId, source.external_key],
  );

  const mergedConfig: Record<string, unknown> = {
    ...sanitizeSourceConfigForExport(source.source_config || {}),
  };
  if (typeof source.source_config.credential_slug === 'string') {
    mergedConfig.credential_slug = source.source_config.credential_slug;
  }

  const previous = existing.rows[0]?.source_config || {};
  for (const key of DATA_SOURCE_SECRET_KEYS) {
    const incoming = source.source_config?.[key];
    if (typeof incoming === 'string' && incoming.length > 0) {
      mergedConfig[key] = incoming;
    } else if (typeof previous[key] === 'string' && previous[key]) {
      // Preserve secrets already stored on the target when the package omits them.
      mergedConfig[key] = previous[key];
    }
  }

  const row = await client.query<{ id: string }>(
    `INSERT INTO data_sources (
       tenant_id, external_key, name, description, entity_type, source_type,
       source_config, column_mapping, schedule_cron, schedule_enabled,
       import_mode, upsert_key, created_by
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7::jsonb, $8::jsonb, $9, $10,
       $11, $12, $13
     )
     ON CONFLICT (tenant_id, external_key) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       entity_type = EXCLUDED.entity_type,
       source_type = EXCLUDED.source_type,
       source_config = EXCLUDED.source_config,
       column_mapping = EXCLUDED.column_mapping,
       schedule_cron = EXCLUDED.schedule_cron,
       schedule_enabled = EXCLUDED.schedule_enabled,
       import_mode = EXCLUDED.import_mode,
       upsert_key = EXCLUDED.upsert_key,
       updated_at = now()
     RETURNING id`,
    [
      tenantId,
      source.external_key,
      source.name,
      source.description || null,
      source.entity_type,
      source.source_type,
      JSON.stringify(mergedConfig),
      JSON.stringify(source.column_mapping || {}),
      source.schedule_cron,
      source.schedule_enabled,
      source.import_mode,
      source.upsert_key || null,
      userId,
    ],
  );
  return {
    id: row.rows[0].id,
    previousScheduleEnabled: existing.rows[0]?.schedule_enabled === true,
  };
}

export async function applyBundle(
  tenantId: string,
  userId: string,
  roles: string[],
  bundle: ConfigPackageBundle,
  dryRun: ValidationReport,
): Promise<ApplyResult['applied']> {
  return db.withTenantTransaction(tenantId, userId, roles.join(','), async (client) => {
    for (const wf of bundle.contents.workflows.definitions) {
      await upsertWorkflowDefinition(client, tenantId, userId, wf);
    }

    const categoryIds = new Map<string, string>();
    for (const category of bundle.contents.catalog.categories) {
      const id = await upsertCategory(client, tenantId, category);
      categoryIds.set(category.external_key, id);
    }

    const modelIds = new Map<string, string>();
    for (const model of bundle.contents.catalog.fulfillment_models) {
      const id = await upsertFulfillmentModel(client, tenantId, model);
      modelIds.set(model.external_key, id);
    }

    const applied = {
      categories: bundle.contents.catalog.categories.length,
      fulfillment_models: bundle.contents.catalog.fulfillment_models.length,
      service_items: 0,
      catalog_tasks: 0,
      notification_rules: 0,
      data_sources: 0,
      workflow_definitions: bundle.contents.workflows.definitions.length,
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
      let fulfillmentModelId: string | null = null;
      if (item.fulfillment_model_external_key) {
        fulfillmentModelId = modelIds.get(item.fulfillment_model_external_key) || null;
        if (!fulfillmentModelId) {
          const existingModel = await client.query<{ id: string }>(
            `SELECT id FROM fulfillment_models WHERE tenant_id = $1 AND external_key = $2 LIMIT 1`,
            [tenantId, item.fulfillment_model_external_key],
          );
          fulfillmentModelId = existingModel.rows[0]?.id || null;
        }
        if (!fulfillmentModelId) throw BadRequest(`Missing fulfillment model "${item.fulfillment_model_external_key}"`);
      }
      const itemId = await upsertServiceItem(client, tenantId, item, categoryId, fulfillmentModelId);
      applied.service_items += 1;
      if (item.picture) await writePicture(client, itemId, item.picture);
      if (fulfillmentModelId) continue;
      for (const task of item.tasks) {
        await upsertCatalogTask(client, tenantId, itemId, task);
        applied.catalog_tasks += 1;
      }
    }

    for (const rule of bundle.contents.notifications.rules) {
      await upsertNotificationRule(client, tenantId, rule);
      applied.notification_rules += 1;
    }

    for (const source of bundle.contents.data_sources.sources) {
      const upserted = await upsertDataSource(client, tenantId, userId, source);
      applied.data_sources += 1;
      try {
        if (source.schedule_enabled) {
          await enqueueDataSourceScheduleStartJob({
            dataSourceId: upserted.id,
            tenantId,
            cronSchedule: source.schedule_cron,
          });
        } else if (upserted.previousScheduleEnabled) {
          await cancelDataSourceSchedule(upserted.id);
        }
      } catch {
        // Don't fail package apply if Temporal is unavailable.
      }
    }

    // Touch the validation object so future maintainers see apply is gated by it.
    if (!dryRun.valid) throw BadRequest('Cannot apply an invalid configuration package');
    return applied;
  });
}

export type ValidateAndApplyOutcome =
  | { success: false; run_id: string; dry_run: ValidationReport }
  | (ApplyResult & { success: true; run_id: string });

/** Validates the bundle against the tenant, applies it when valid, and records a deployment run either way. */
export async function validateAndApplyConfigPackage(args: {
  tenantId: string;
  actorUserId: string;
  roles: string[];
  bundle: ConfigPackageBundle;
}): Promise<ValidateAndApplyOutcome> {
  const { tenantId, actorUserId, roles, bundle } = args;
  await ensureConfigPackageSchema();
  const report = await db.withTenantTransaction(tenantId, actorUserId, roles.join(','), async (client) => {
    await backfillExternalKeys(client, tenantId);
    return validateBundle(client, tenantId, bundle);
  });
  if (!report.valid) {
    const runId = await recordDeploymentRun({
      tenantId,
      actorUserId,
      bundle,
      dryRun: false,
      status: 'failed',
      summary: report.summary,
      result: report,
    });
    return { success: false, run_id: runId, dry_run: report };
  }
  const applied = await applyBundle(tenantId, actorUserId, roles, bundle, report);
  const result: ApplyResult = { success: true, run_id: null, dry_run: report, applied };
  const runId = await recordDeploymentRun({
    tenantId,
    actorUserId,
    bundle,
    dryRun: false,
    status: 'applied',
    summary: { ...report.summary, applied },
    result,
  });
  return { ...result, success: true, run_id: runId };
}
