/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import type { PoolClient } from 'pg';
import { authenticate, getRequestClient, releaseTenantClient, setTenantRLS } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import {
  hasReportingAdminRole,
  hasReportingCreateRole,
  hasReportingViewRole,
} from '../roles';
import {
  compileChartQuery,
  compileKpiQuery,
  compileTableQuery,
  normalizeComponentConfig,
  type ReportComponentConfig,
} from './queryCompiler';
import { recordAuditEvent } from '../../audit/events';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

type ReportDefinitionRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_shared: boolean;
  allowed_roles: string[];
  layout: Record<string, unknown>;
  components: unknown[];
  default_filters: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  version: number;
};

const MAX_COMPONENTS_PER_REPORT = 24;
const QUERY_STATEMENT_TIMEOUT_MS = 4000;

function requestClient(req: Request): PoolClient {
  return getRequestClient(req) as PoolClient;
}

function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}

function normalizeRolesArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((item) => String(item).trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function ensureReportingView(req: Request): void {
  if (!hasReportingViewRole(req)) throw new AppError(403, 'Insufficient permissions to view reports');
}

function ensureReportingCreate(req: Request): void {
  if (!hasReportingCreateRole(req)) throw new AppError(403, 'Insufficient permissions to create reports');
}

function canViewReport(definition: ReportDefinitionRow, req: Request): boolean {
  const roles = normalizeRolesArray(req.user?.roles ?? []);
  if (hasReportingAdminRole(req)) return true;
  if (definition.created_by && definition.created_by === req.user?.id) return true;
  if (!definition.is_shared) return false;
  if (definition.allowed_roles.length === 0) return true;
  return definition.allowed_roles.some((role) => roles.includes(normalizeRole(role)));
}

function canManageReport(definition: ReportDefinitionRow, req: Request): boolean {
  if (hasReportingAdminRole(req)) return true;
  return !!definition.created_by && definition.created_by === req.user?.id;
}

async function appendReportActivity(
  req: Request,
  action: string,
  metadata: Record<string, unknown>,
  reportDefinitionId?: string | null,
): Promise<void> {
  const client = requestClient(req);
  await client.query(
    `INSERT INTO report_activity_events (tenant_id, report_definition_id, actor_user_id, action, metadata)
     VALUES (current_tenant_id(), $1, $2, $3, $4::jsonb)`,
    [reportDefinitionId || null, req.user!.id, action, JSON.stringify(metadata)],
  );
  await recordAuditEvent({
    tenantId: req.user!.tenant_id,
    actorUserId: req.user!.id,
    category: 'reports',
    action,
    entityType: reportDefinitionId ? 'report_definition' : 'reporting',
    entityId: reportDefinitionId || null,
    metadata,
  });
}

async function runComponentPreview(
  req: Request,
  component: ReportComponentConfig,
): Promise<Record<string, unknown>> {
  const client = requestClient(req);
  await client.query(`SET LOCAL statement_timeout = '${QUERY_STATEMENT_TIMEOUT_MS}ms'`);

  if (component.type === 'table') {
    const compiled = compileTableQuery(component, 500);
    const rows = await client.query(compiled.text, compiled.values);
    return {
      type: 'table',
      dataset: component.dataset,
      row_count: rows.rows.length,
      rows: rows.rows,
    };
  }

  if (component.type === 'bar_chart' || component.type === 'pie_chart') {
    const compiled = compileChartQuery(component, 24);
    const rows = await client.query<{ raw_label: string | number | boolean | null; label: string; value: string | null }>(
      compiled.text,
      compiled.values,
    );
    return {
      type: component.type,
      dataset: component.dataset,
      group_by: component.group_by,
      metric: component.metric,
      points: rows.rows.map((row) => ({
        raw_label: row.raw_label,
        label: row.label,
        value: row.value === null ? 0 : Number(row.value),
      })),
    };
  }

  if (component.type !== 'kpi') {
    throw new AppError(400, `Unsupported component type "${String((component as { type?: unknown }).type || '')}"`);
  }
  const compiled = compileKpiQuery(component);
  const valueResult = await client.query<{ value: string | null }>(compiled.text, compiled.values);
  return {
    type: 'kpi',
    dataset: component.dataset,
    metric: component.metric,
    value: valueResult.rows[0]?.value === null || valueResult.rows[0]?.value === undefined
      ? null
      : Number(valueResult.rows[0].value),
  };
}

router.get('/kpis', async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureReportingView(req);
    const client = requestClient(req);
    const [incident, change, request, problem] = await Promise.all([
      client.query(
        `SELECT
           count(*) FILTER (WHERE status NOT IN ('closed','cancelled'))::int AS open_count,
           count(*) FILTER (WHERE sla_breached = true AND status NOT IN ('closed','cancelled'))::int AS sla_breached,
           avg(EXTRACT(EPOCH FROM (COALESCE(resolved_at, now()) - created_at)) / 3600)::numeric(10,2) AS mttr_hours
         FROM incidents
         WHERE tenant_id = current_tenant_id()`,
      ),
      client.query(
        `SELECT
           count(*) FILTER (WHERE status = 'closed')::int AS closed_count,
           count(*) FILTER (WHERE status = 'closed' AND success = true)::int AS successful_count
         FROM changes
         WHERE tenant_id = current_tenant_id()`,
      ),
      client.query(
        `SELECT
           count(*) FILTER (WHERE status NOT IN ('fulfilled', 'cancelled'))::int AS open_count,
           avg(EXTRACT(EPOCH FROM (now() - created_at)) / 3600)::numeric(10,2) AS backlog_age_hours
         FROM requests
         WHERE tenant_id = current_tenant_id()`,
      ),
      client.query(
        `SELECT count(*) FILTER (WHERE status NOT IN ('resolved', 'closed'))::int AS open_count
         FROM problems
         WHERE tenant_id = current_tenant_id()`,
      ),
    ]);

    const closedCount = Number(change.rows[0]?.closed_count || 0);
    const successfulCount = Number(change.rows[0]?.successful_count || 0);
    const changeSuccessRate = closedCount > 0 ? Number((successfulCount / closedCount).toFixed(4)) : null;

    res.json({
      incidents: incident.rows[0],
      changes: { ...change.rows[0], success_rate: changeSuccessRate },
      requests: request.rows[0],
      problems: problem.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

router.get('/definitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureReportingView(req);
    const client = requestClient(req);
    const roles = normalizeRolesArray(req.user?.roles ?? []);
    const isAdmin = hasReportingAdminRole(req);
    const rows = await client.query<ReportDefinitionRow>(
      `SELECT
         rd.id, rd.tenant_id, rd.name, rd.description, rd.is_shared,
         rd.allowed_roles, rd.layout, rd.components, rd.default_filters,
         rd.created_by, rd.updated_by, rd.created_at, rd.updated_at, rd.last_run_at, rd.version
       FROM report_definitions rd
       WHERE rd.tenant_id = current_tenant_id()
         AND (
           $1::boolean = true
           OR rd.created_by = $2
           OR (
             rd.is_shared = true
             AND (
               cardinality(rd.allowed_roles) = 0
               OR rd.allowed_roles && $3::text[]
             )
           )
         )
       ORDER BY rd.updated_at DESC`,
      [isAdmin, req.user!.id, roles],
    );

    res.json({
      reports: rows.rows.map((row: ReportDefinitionRow) => ({
        ...row,
        can_edit: canManageReport(row, req),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/definitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureReportingCreate(req);
    const client = requestClient(req);
    const name = String(req.body?.name || '').trim();
    if (!name) throw new AppError(400, 'name is required');
    const description = req.body?.description ? String(req.body.description).trim() : null;
    const isShared = Boolean(req.body?.is_shared);
    const allowedRoles = isShared ? normalizeRolesArray(req.body?.allowed_roles) : [];
    const layout = req.body?.layout && typeof req.body.layout === 'object' ? req.body.layout : {};
    const defaultFilters = req.body?.default_filters && typeof req.body.default_filters === 'object'
      ? req.body.default_filters
      : {};
    const rawComponents = Array.isArray(req.body?.components) ? req.body.components : [];
    if (rawComponents.length > MAX_COMPONENTS_PER_REPORT) {
      throw new AppError(400, `A report can have at most ${MAX_COMPONENTS_PER_REPORT} components`);
    }
    const components = rawComponents.map((component: unknown) => normalizeComponentConfig(component));

    const inserted = await client.query<ReportDefinitionRow>(
      `INSERT INTO report_definitions (
         tenant_id, name, description, is_shared, allowed_roles, layout,
         components, default_filters, created_by, updated_by
       )
       VALUES (
         current_tenant_id(), $1, $2, $3, $4::text[], $5::jsonb,
         $6::jsonb, $7::jsonb, $8, $8
       )
       RETURNING
         id, tenant_id, name, description, is_shared, allowed_roles,
         layout, components, default_filters, created_by, updated_by,
         created_at, updated_at, last_run_at, version`,
      [
        name,
        description,
        isShared,
        allowedRoles,
        JSON.stringify(layout),
        JSON.stringify(components),
        JSON.stringify(defaultFilters),
        req.user!.id,
      ],
    );

    await appendReportActivity(req, 'report.definition.create', {
      report_name: name,
      is_shared: isShared,
      component_count: components.length,
    }, inserted.rows[0]!.id);

    res.status(201).json({ report: inserted.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/definitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureReportingView(req);
    const client = requestClient(req);
    const row = await client.query<ReportDefinitionRow>(
      `SELECT
         id, tenant_id, name, description, is_shared, allowed_roles,
         layout, components, default_filters, created_by, updated_by,
         created_at, updated_at, last_run_at, version
       FROM report_definitions
       WHERE tenant_id = current_tenant_id() AND id = $1`,
      [req.params.id],
    );
    const report = row.rows[0];
    if (!report) throw new AppError(404, 'Report definition not found');
    if (!canViewReport(report, req)) throw new AppError(403, 'You cannot access this report');
    res.json({ report, can_edit: canManageReport(report, req) });
  } catch (err) {
    next(err);
  }
});

router.patch('/definitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureReportingCreate(req);
    const reportId = String(req.params.id);
    const client = requestClient(req);
    const currentRes = await client.query<ReportDefinitionRow>(
      `SELECT
         id, tenant_id, name, description, is_shared, allowed_roles,
         layout, components, default_filters, created_by, updated_by,
         created_at, updated_at, last_run_at, version
       FROM report_definitions
       WHERE tenant_id = current_tenant_id() AND id = $1`,
      [reportId],
    );
    const current = currentRes.rows[0];
    if (!current) throw new AppError(404, 'Report definition not found');
    if (!canManageReport(current, req)) throw new AppError(403, 'You cannot modify this report');

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) throw new AppError(400, 'name cannot be empty');
      sets.push(`name = $${idx++}`);
      values.push(name);
    }
    if (req.body?.description !== undefined) {
      sets.push(`description = $${idx++}`);
      values.push(req.body.description ? String(req.body.description).trim() : null);
    }
    if (req.body?.is_shared !== undefined) {
      sets.push(`is_shared = $${idx++}`);
      values.push(Boolean(req.body.is_shared));
    }
    if (req.body?.allowed_roles !== undefined) {
      sets.push(`allowed_roles = $${idx++}::text[]`);
      values.push(normalizeRolesArray(req.body.allowed_roles));
    }
    if (req.body?.layout !== undefined) {
      if (!req.body.layout || typeof req.body.layout !== 'object') {
        throw new AppError(400, 'layout must be an object');
      }
      sets.push(`layout = $${idx++}::jsonb`);
      values.push(JSON.stringify(req.body.layout));
    }
    if (req.body?.default_filters !== undefined) {
      if (!req.body.default_filters || typeof req.body.default_filters !== 'object') {
        throw new AppError(400, 'default_filters must be an object');
      }
      sets.push(`default_filters = $${idx++}::jsonb`);
      values.push(JSON.stringify(req.body.default_filters));
    }
    if (req.body?.components !== undefined) {
      if (!Array.isArray(req.body.components)) {
        throw new AppError(400, 'components must be an array');
      }
      if (req.body.components.length > MAX_COMPONENTS_PER_REPORT) {
        throw new AppError(400, `A report can have at most ${MAX_COMPONENTS_PER_REPORT} components`);
      }
      const components = req.body.components.map((component: unknown) => normalizeComponentConfig(component));
      sets.push(`components = $${idx++}::jsonb`);
      values.push(JSON.stringify(components));
    }

    if (sets.length === 0) {
      res.json({ report: current });
      return;
    }
    sets.push(`updated_by = $${idx++}`);
    values.push(req.user!.id);
    sets.push('version = version + 1');

    values.push(reportId);
    const updateRes = await client.query<ReportDefinitionRow>(
      `UPDATE report_definitions
       SET ${sets.join(', ')}
       WHERE tenant_id = current_tenant_id() AND id = $${idx}
       RETURNING
         id, tenant_id, name, description, is_shared, allowed_roles,
         layout, components, default_filters, created_by, updated_by,
         created_at, updated_at, last_run_at, version`,
      values,
    );

    await appendReportActivity(req, 'report.definition.update', {
      report_id: reportId,
      updated_fields: Object.keys(req.body || {}),
    }, reportId);

    res.json({ report: updateRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/definitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureReportingCreate(req);
    const client = requestClient(req);
    const currentRes = await client.query<ReportDefinitionRow>(
      `SELECT
         id, tenant_id, name, description, is_shared, allowed_roles,
         layout, components, default_filters, created_by, updated_by,
         created_at, updated_at, last_run_at, version
       FROM report_definitions
       WHERE tenant_id = current_tenant_id() AND id = $1`,
      [req.params.id],
    );
    const current = currentRes.rows[0];
    if (!current) throw new AppError(404, 'Report definition not found');
    if (!canManageReport(current, req)) throw new AppError(403, 'You cannot delete this report');

    await client.query(
      'DELETE FROM report_definitions WHERE tenant_id = current_tenant_id() AND id = $1',
      [req.params.id],
    );

    await appendReportActivity(req, 'report.definition.delete', {
      report_id: current.id,
      report_name: current.name,
    }, current.id);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post('/preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureReportingView(req);
    const component = normalizeComponentConfig(req.body?.component);
    const preview = await runComponentPreview(req, component);
    await appendReportActivity(req, 'report.component.preview', {
      component_type: component.type,
      dataset: component.dataset,
    }, null);
    res.json({ preview });
  } catch (err) {
    next(err);
  }
});

router.post('/definitions/:id/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureReportingView(req);
    const reportId = String(req.params.id);
    const client = requestClient(req);
    const row = await client.query<ReportDefinitionRow>(
      `SELECT
         id, tenant_id, name, description, is_shared, allowed_roles,
         layout, components, default_filters, created_by, updated_by,
         created_at, updated_at, last_run_at, version
       FROM report_definitions
       WHERE tenant_id = current_tenant_id() AND id = $1`,
      [reportId],
    );
    const report = row.rows[0];
    if (!report) throw new AppError(404, 'Report definition not found');
    if (!canViewReport(report, req)) throw new AppError(403, 'You cannot access this report');
    if (!Array.isArray(report.components)) {
      throw new AppError(400, 'Report definition has invalid components');
    }

    const results: Array<Record<string, unknown>> = [];
    for (const rawComponent of report.components) {
      const component = normalizeComponentConfig(rawComponent);
      const result = await runComponentPreview(req, component);
      results.push({
        component,
        result,
      });
    }

    await client.query(
      `UPDATE report_definitions
       SET last_run_at = now(), updated_by = $1
       WHERE tenant_id = current_tenant_id() AND id = $2`,
      [req.user!.id, reportId],
    );

    await appendReportActivity(req, 'report.definition.run', {
      report_id: reportId,
      component_count: results.length,
    }, reportId);

    res.json({
      report: {
        id: report.id,
        name: report.name,
        description: report.description,
        layout: report.layout,
      },
      results,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/exports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureReportingCreate(req);
    const client = requestClient(req);
    const reportDefinitionId = String(req.body?.report_definition_id || '').trim();
    const reportKey = String(req.body?.report_key || '').trim();
    if (!reportDefinitionId && !reportKey) {
      throw new AppError(400, 'Either report_definition_id or report_key is required');
    }

    let rows: unknown[] = [];
    let exportKey = reportKey;
    let payload: Record<string, unknown> = {};

    if (reportDefinitionId) {
      const reportRes = await client.query<ReportDefinitionRow>(
        `SELECT
           id, tenant_id, name, description, is_shared, allowed_roles,
           layout, components, default_filters, created_by, updated_by,
           created_at, updated_at, last_run_at, version
         FROM report_definitions
         WHERE tenant_id = current_tenant_id() AND id = $1`,
        [reportDefinitionId],
      );
      const report = reportRes.rows[0];
      if (!report) throw new AppError(404, 'Report definition not found');
      if (!canViewReport(report, req)) throw new AppError(403, 'You cannot export this report');
      if (!Array.isArray(report.components) || report.components.length === 0) {
        throw new AppError(400, 'Report has no components to export');
      }
      const results: Array<Record<string, unknown>> = [];
      for (const rawComponent of report.components) {
        const component = normalizeComponentConfig(rawComponent);
        const result = await runComponentPreview(req, component);
        results.push({ component, result });
      }
      payload = { report_id: report.id, report_name: report.name, results };
      exportKey = `definition:${report.id}`;
      rows = results;
    } else if (reportKey === 'incidents.sla') {
      const r = await client.query(
        `SELECT number, title, status, priority, sla_due_at, sla_breached, created_at
         FROM incidents
         WHERE tenant_id = current_tenant_id()
         ORDER BY created_at DESC
         LIMIT 1000`,
      );
      rows = r.rows;
      payload = { rows };
    } else if (reportKey === 'changes.success') {
      const r = await client.query(
        `SELECT number, title, status, success, risk_level, scheduled_start, scheduled_end, created_at
         FROM changes
         WHERE tenant_id = current_tenant_id()
         ORDER BY created_at DESC
         LIMIT 1000`,
      );
      rows = r.rows;
      payload = { rows };
    } else {
      throw new AppError(400, 'Unsupported report_key');
    }

    const inserted = await client.query(
      `INSERT INTO report_exports (tenant_id, created_by, report_key, status, row_count, payload)
       VALUES (current_tenant_id(), $1, $2, 'completed', $3, $4::jsonb)
       RETURNING id, generated_at`,
      [req.user!.id, exportKey, rows.length, JSON.stringify(payload)],
    );

    await appendReportActivity(req, 'report.export.create', {
      report_key: exportKey,
      row_count: rows.length,
      source_definition_id: reportDefinitionId || null,
    }, reportDefinitionId || null);

    res.status(201).json({
      export: {
        id: inserted.rows[0].id,
        report_key: exportKey,
        row_count: rows.length,
        generated_at: inserted.rows[0].generated_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/exports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureReportingView(req);
    const client = requestClient(req);
    const rows = await client.query(
      `SELECT id, report_key, status, row_count, generated_at, created_by
       FROM report_exports
       WHERE tenant_id = current_tenant_id()
       ORDER BY generated_at DESC
       LIMIT 100`,
    );
    res.json({ exports: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/activity', async (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureReportingView(req);
    const client = requestClient(req);
    const reportDefinitionId = String(req.query.report_definition_id || '').trim();
    const limitRaw = Number.parseInt(String(req.query.limit || '100'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 300)) : 100;
    const filters: string[] = ['rae.tenant_id = current_tenant_id()'];
    const values: unknown[] = [];

    if (reportDefinitionId) {
      values.push(reportDefinitionId);
      filters.push(`rae.report_definition_id = $${values.length}`);
    }
    values.push(limit);

    const rows = await client.query(
      `SELECT
         rae.id,
         rae.report_definition_id,
         rd.name AS report_name,
         rae.actor_user_id,
         u.display_name AS actor_name,
         rae.action,
         rae.metadata,
         rae.created_at
       FROM report_activity_events rae
       LEFT JOIN report_definitions rd ON rd.id = rae.report_definition_id
       LEFT JOIN users u ON u.id = rae.actor_user_id
       WHERE ${filters.join(' AND ')}
       ORDER BY rae.created_at DESC
       LIMIT $${values.length}`,
      values,
    );
    res.json({ events: rows.rows });
  } catch (err) {
    next(err);
  }
});

export default router;
