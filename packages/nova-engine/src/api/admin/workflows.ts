/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Admin: Workflow builder definitions ───

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../data/db';
import { AppError } from '../../middleware/errorHandler';

const router = Router();

// ════════════════════════════════════════════
// WORKFLOW BUILDER DEFINITIONS
// ════════════════════════════════════════════

type WorkflowDefinitionRow = {
  id: string;
  name: string;
  workflow_type: string;
  draft_definition: Record<string, unknown>;
  published_definition: Record<string, unknown> | null;
  version: number;
  is_active: boolean;
  draft_updated_at: string;
  published_at: string | null;
  published_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

router.get('/workflow-definitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const rows = await db.getMany<WorkflowDefinitionRow>(
      `SELECT id, name, workflow_type, draft_definition, published_definition,
              version, is_active, draft_updated_at, published_at, published_by, created_by, created_at, updated_at
       FROM workflow_definitions
       WHERE tenant_id = $1
       ORDER BY updated_at DESC`,
      [tenantId],
    );
    res.json({ workflow_definitions: rows });
  } catch (err) { next(err); }
});

router.get('/workflow-definitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const row = await db.getOne<WorkflowDefinitionRow>(
      `SELECT id, name, workflow_type, draft_definition, published_definition,
              version, is_active, draft_updated_at, published_at, published_by, created_by, created_at, updated_at
       FROM workflow_definitions
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    if (!row) throw new AppError(404, 'Workflow definition not found');
    res.json({ workflow_definition: row });
  } catch (err) { next(err); }
});

router.post('/workflow-definitions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    const { name, workflow_type, draft_definition } = req.body as {
      name?: string;
      workflow_type?: string;
      draft_definition?: Record<string, unknown>;
    };

    if (!name?.trim()) throw new AppError(400, 'name is required');
    if (!workflow_type?.trim()) throw new AppError(400, 'workflow_type is required');

    const row = await db.getOne<{ id: string }>(
      `INSERT INTO workflow_definitions
        (tenant_id, name, workflow_type, draft_definition, created_by, draft_updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, now())
       RETURNING id`,
      [
        tenantId,
        name.trim(),
        workflow_type.trim(),
        JSON.stringify(draft_definition ?? {}),
        userId,
      ],
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.patch('/workflow-definitions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const {
      name,
      workflow_type,
      draft_definition,
      is_active,
    } = req.body as {
      name?: string;
      workflow_type?: string;
      draft_definition?: Record<string, unknown>;
      is_active?: boolean;
    };

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name.trim()); }
    if (workflow_type !== undefined) { sets.push(`workflow_type = $${i++}`); vals.push(workflow_type.trim()); }
    if (draft_definition !== undefined) {
      sets.push(`draft_definition = $${i++}::jsonb`);
      sets.push(`draft_updated_at = now()`);
      vals.push(JSON.stringify(draft_definition));
    }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }

    if (sets.length === 0) { res.json({ success: true }); return; }

    vals.push(req.params.id, tenantId);
    const result = await db.query(
      `UPDATE workflow_definitions
       SET ${sets.join(', ')}
       WHERE id = $${i++} AND tenant_id = $${i}`,
      vals,
    );
    if (result.rowCount === 0) throw new AppError(404, 'Workflow definition not found');
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/workflow-definitions/:id/publish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    const { draft_definition } = req.body as { draft_definition?: Record<string, unknown> };

    const sets = [
      `published_definition = COALESCE($1::jsonb, draft_definition)`,
      `published_at = now()`,
      `published_by = $2`,
      `version = version + 1`,
    ];
    const vals: unknown[] = [
      draft_definition !== undefined ? JSON.stringify(draft_definition) : null,
      userId,
      req.params.id,
      tenantId,
    ];

    const result = await db.query(
      `UPDATE workflow_definitions
       SET ${sets.join(', ')}
       WHERE id = $3 AND tenant_id = $4`,
      vals,
    );
    if (result.rowCount === 0) throw new AppError(404, 'Workflow definition not found');
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/workflow-definitions/:id/duplicate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const userId = req.user!.id;
    const source = await db.getOne<WorkflowDefinitionRow>(
      `SELECT id, name, workflow_type, draft_definition, published_definition,
              version, is_active, draft_updated_at, published_at, published_by, created_by, created_at, updated_at
       FROM workflow_definitions
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    if (!source) throw new AppError(404, 'Workflow definition not found');

    const duplicateName = `${source.name} (copy)`;
    const row = await db.getOne<{ id: string }>(
      `INSERT INTO workflow_definitions
        (tenant_id, name, workflow_type, draft_definition, created_by, draft_updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, now())
       RETURNING id`,
      [tenantId, duplicateName, source.workflow_type, JSON.stringify(source.draft_definition), userId],
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
});

export default router;
