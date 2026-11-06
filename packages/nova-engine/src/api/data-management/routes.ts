/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import type { PoolClient } from 'pg';
import {
  DataManagementQueryError,
  compileIncidentMatch,
  dataManagementJobRequestSchema,
  dataManagementPreviewSchema,
  incidentCountSql,
  incidentSampleSql,
  listDataManagementTargets,
  type DataManagementAction,
  type DataManagementFilter,
} from '@nova-suite/shared';
import { recordAuditEvent } from '../../audit/events';
import { AppError, NotFound } from '../../middleware/errorHandler';
import { authenticate, getRequestClient, releaseTenantClient, requireRole, setTenantRLS } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { logger } from '../../logger';
import { startDataManagementJob } from '../../temporal/workflows';

const router = Router();
const JOB_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.use(authenticate, requireRole('admin', 'data_manager'), setTenantRLS, releaseTenantClient);

router.get('/targets', (_req: Request, res: Response) => {
  res.json({ targets: listDataManagementTargets() });
});

router.post(
  '/preview',
  validateBody(dataManagementPreviewSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as {
        action: DataManagementAction;
        filters: DataManagementFilter[];
        include_open: boolean;
      };
      const client = getRequestClient(req);
      const { count, sample } = await previewMatches(client, body.filters, body.include_open, body.action);
      res.json({ count, sample });
    } catch (err) {
      next(asQueryError(err));
    }
  },
);

router.get('/jobs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(
      `SELECT j.id, j.target, j.action, j.filters, j.include_open, j.status,
              j.match_count, j.affected_count, j.error, j.created_at, j.started_at, j.completed_at,
              u.display_name AS actor_name
       FROM data_management_jobs j
       LEFT JOIN users u ON u.id = j.actor_user_id
       ORDER BY j.created_at DESC
       LIMIT 50`,
    );
    res.json({ jobs: result.rows });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/jobs',
  validateBody(dataManagementJobRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as {
        target: 'incidents';
        action: DataManagementAction;
        filters: DataManagementFilter[];
        include_open: boolean;
        confirm_count: number;
      };
      const client = getRequestClient(req);
      const { count } = await previewMatches(client, body.filters, body.include_open, body.action);
      if (count === 0) {
        next(new AppError(400, 'No records match these filters', 'BAD_REQUEST'));
        return;
      }
      if (count !== body.confirm_count) {
        next(new AppError(409, `Match count is ${count}. Preview again before confirming.`, 'CONFLICT'));
        return;
      }

      const inserted = await client.query(
        `INSERT INTO data_management_jobs (
           tenant_id, actor_user_id, target, action, filters, include_open, match_count
         ) VALUES (current_tenant_id(), $1, $2, $3, $4::jsonb, $5, $6)
         RETURNING id, target, action, filters, include_open, status, match_count, affected_count,
                   error, created_at, started_at, completed_at`,
        [
          req.user!.id,
          body.target,
          body.action,
          JSON.stringify(body.filters),
          body.include_open,
          count,
        ],
      );
      const job = inserted.rows[0] as { id: string };

      await recordAuditEvent({
        tenantId: req.user!.tenant_id,
        actorUserId: req.user!.id,
        action: 'job.started',
        category: 'data_management',
        entityType: 'data_management_job',
        entityId: job.id,
        clientIp: req.ip,
        metadata: {
          target: body.target,
          action: body.action,
          filters: body.filters,
          include_open: body.include_open,
          match_count: count,
        },
      });

      try {
        const workflowId = await startDataManagementJob({
          jobId: job.id,
          tenantId: req.user!.tenant_id,
        });
        await client.query(
          `UPDATE data_management_jobs SET workflow_id = $2, updated_at = now() WHERE id = $1`,
          [job.id, workflowId],
        );
        res.status(201).json({ job: { ...inserted.rows[0], workflow_id: workflowId } });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not start the retention job';
        logger.error({ err, jobId: job.id }, 'Failed to start data management workflow');
        await client.query(
          `UPDATE data_management_jobs
           SET status = 'failed', error = $2, completed_at = now(), updated_at = now()
           WHERE id = $1`,
          [job.id, message.slice(0, 2000)],
        );
        await recordAuditEvent({
          tenantId: req.user!.tenant_id,
          actorUserId: req.user!.id,
          action: 'job.failed',
          category: 'data_management',
          level: 'warning',
          entityType: 'data_management_job',
          entityId: job.id,
          clientIp: req.ip,
          metadata: {
            target: body.target,
            action: body.action,
            filters: body.filters,
            include_open: body.include_open,
            match_count: count,
          },
        });
        next(new AppError(503, 'Could not start the retention job', 'TEMPORAL_UNAVAILABLE'));
      }
    } catch (err) {
      next(asQueryError(err));
    }
  },
);

router.get('/jobs/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id || '');
    if (!JOB_ID_RE.test(id)) {
      next(new AppError(400, 'Invalid job id', 'BAD_REQUEST'));
      return;
    }
    const client = getRequestClient(req);
    const result = await client.query(
      `SELECT j.id, j.target, j.action, j.filters, j.include_open, j.status,
              j.match_count, j.affected_count, j.error, j.created_at, j.started_at, j.completed_at,
              u.display_name AS actor_name
       FROM data_management_jobs j
       LEFT JOIN users u ON u.id = j.actor_user_id
       WHERE j.id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      next(NotFound('Job not found'));
      return;
    }
    res.json({ job: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

async function previewMatches(
  client: PoolClient,
  filters: DataManagementFilter[],
  includeOpen: boolean,
  action: DataManagementAction,
): Promise<{ count: number; sample: Record<string, unknown>[] }> {
  const match = compileIncidentMatch(filters, {
    includeOpen,
    onlyActive: action === 'archive',
  });
  const countQuery = incidentCountSql(match);
  const sampleQuery = incidentSampleSql(match);
  const countResult = await client.query<{ count: number }>(countQuery.text, countQuery.values);
  const sampleResult = await client.query(sampleQuery.text, sampleQuery.values);
  return {
    count: Number(countResult.rows[0]?.count ?? 0),
    sample: sampleResult.rows,
  };
}

function asQueryError(err: unknown): unknown {
  if (err instanceof DataManagementQueryError) {
    return new AppError(400, err.message, 'BAD_REQUEST');
  }
  return err;
}

export default router;
