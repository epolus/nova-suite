/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, getRequestClient, releaseTenantClient, setTenantRLS } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

router.get('/kpis', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
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

router.post('/exports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportKey = String(req.body?.report_key || '').trim();
    if (!reportKey) throw new AppError(400, 'report_key is required');
    const client = getRequestClient(req);

    let rows: any[] = [];
    if (reportKey === 'incidents.sla') {
      const r = await client.query(
        `SELECT number, title, status, priority, sla_due_at, sla_breached, created_at
         FROM incidents
         WHERE tenant_id = current_tenant_id()
         ORDER BY created_at DESC
         LIMIT 1000`,
      );
      rows = r.rows;
    } else if (reportKey === 'changes.success') {
      const r = await client.query(
        `SELECT number, title, status, success, risk_level, scheduled_start, scheduled_end, created_at
         FROM changes
         WHERE tenant_id = current_tenant_id()
         ORDER BY created_at DESC
         LIMIT 1000`,
      );
      rows = r.rows;
    } else {
      throw new AppError(400, 'Unsupported report_key');
    }

    const inserted = await client.query(
      `INSERT INTO report_exports (tenant_id, created_by, report_key, status, row_count, payload)
       VALUES (current_tenant_id(), $1, $2, 'completed', $3, $4::jsonb)
       RETURNING id, generated_at`,
      [req.user!.id, reportKey, rows.length, JSON.stringify({ rows })],
    );
    res.status(201).json({
      export: {
        id: inserted.rows[0].id,
        report_key: reportKey,
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
    const client = getRequestClient(req);
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

export default router;
