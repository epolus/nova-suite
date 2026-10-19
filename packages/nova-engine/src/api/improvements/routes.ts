/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import type { PoolClient } from 'pg';
import { AppError, NotFound } from '../../middleware/errorHandler';
import { authenticate, getRequestClient, releaseTenantClient, setTenantRLS } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import {
  IMPROVEMENT_UPDATE_COLUMNS,
  createImprovementSchema,
  improvementFromChangeSchema,
  improvementFromPostmortemSchema,
  improvementFromProblemSchema,
  updateImprovementSchema,
} from '../../domain/schemas';
import { changeImprovementAllowed, problemImprovementAllowed } from '../../domain/improvements';
import { parameterizedSet } from '../../data/parameterized-set';
import { canAccessImprovements, canManageMajorIncidents, hasChangeRole, hasProblemRole } from '../roles';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);
router.use((req: Request, _res: Response, next: NextFunction) => {
  if (!canAccessImprovements(req)) {
    next(new AppError(403, 'Insufficient permissions'));
    return;
  }
  next();
});

const IMPROVEMENT_SELECT = `
  SELECT i.*,
         u.display_name AS owner_name,
         mi.number AS major_incident_number,
         c.number AS change_number,
         p.number AS problem_number
  FROM improvements i
  LEFT JOIN users u ON u.id = i.owner_user_id
  LEFT JOIN major_incidents mi ON mi.id = i.major_incident_id
  LEFT JOIN changes c ON c.id = i.change_id
  LEFT JOIN problems p ON p.id = i.problem_id
`;

type ActionItem = {
  id?: string;
  title: string;
  improvement_id?: string | null;
};

function readActionItems(value: unknown): ActionItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || typeof (item as { title?: unknown }).title !== 'string') return [];
    return [item as ActionItem];
  });
}

async function nextNumber(client: PoolClient): Promise<string> {
  const seq = await client.query(`SELECT nextval('improvement_number_seq') AS n`);
  return `IMP${String((seq.rows[0] as { n: string }).n).padStart(7, '0')}`;
}

async function insertImprovement(
  client: PoolClient,
  req: Request,
  fields: {
    title: string;
    description: string | null;
    sourceType: 'manual' | 'postmortem' | 'change' | 'problem';
    majorIncidentId?: string | null;
    actionItemId?: string | null;
    changeId?: string | null;
    problemId?: string | null;
  },
) {
  const number = await nextNumber(client);
  const created = await client.query(
    `INSERT INTO improvements (
       tenant_id, number, title, description, source_type,
       major_incident_id, action_item_id, change_id, problem_id, created_by
     ) VALUES (
       current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9
     ) RETURNING id, number`,
    [
      number,
      fields.title,
      fields.description,
      fields.sourceType,
      fields.majorIncidentId || null,
      fields.actionItemId || null,
      fields.changeId || null,
      fields.problemId || null,
      req.user!.id,
    ],
  );
  return created.rows[0] as { id: string; number: string };
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `${IMPROVEMENT_SELECT}
       WHERE i.tenant_id = current_tenant_id()
       ORDER BY i.updated_at DESC`,
    );
    res.json({ improvements: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/source', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sourceType = typeof req.query.source_type === 'string' ? req.query.source_type : '';
    const sourceId = typeof req.query.source_id === 'string' ? req.query.source_id : '';
    const actionItemId = typeof req.query.action_item_id === 'string' ? req.query.action_item_id : '';
    if (!sourceId || !['postmortem', 'change', 'problem'].includes(sourceType)) {
      res.json({ improvement: null });
      return;
    }
    const client = getRequestClient(req);
    const column = sourceType === 'postmortem' ? 'major_incident_id' : sourceType === 'change' ? 'change_id' : 'problem_id';
    const params: unknown[] = [sourceType, sourceId];
    let actionClause = '';
    if (sourceType === 'postmortem' && actionItemId) {
      params.push(actionItemId);
      actionClause = ` AND i.action_item_id = $3`;
    }
    const row = await client.query(
      `${IMPROVEMENT_SELECT}
       WHERE i.tenant_id = current_tenant_id()
         AND i.source_type = $1
         AND i.${column} = $2
         ${actionClause}
       LIMIT 1`,
      params,
    );
    res.json({ improvement: row.rows[0] || null });
  } catch (err) {
    next(err);
  }
});

router.post('/', validateBody(createImprovementSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const created = await insertImprovement(client, req, {
      title: req.body.title,
      description: req.body.description || null,
      sourceType: 'manual',
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.post('/from-postmortem', validateBody(improvementFromPostmortemSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageMajorIncidents(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const { major_incident_id: majorIncidentId, action_item_id: actionItemId } = req.body as {
      major_incident_id: string;
      action_item_id: string;
    };
    const current = await client.query(
      `SELECT p.id, p.action_items, mi.number AS major_number
       FROM postmortems p
       JOIN major_incidents mi ON mi.id = p.major_incident_id
       WHERE p.major_incident_id = $1 AND mi.tenant_id = current_tenant_id()`,
      [majorIncidentId],
    );
    if (current.rows.length === 0) throw NotFound('Postmortem not found');
    const row = current.rows[0] as { id: string; action_items: unknown; major_number: string };
    const items = readActionItems(row.action_items);
    const item = items.find((entry) => entry.id === actionItemId);
    if (!item) throw NotFound('Action item not found');
    if (item.improvement_id) {
      res.json({ id: item.improvement_id, already: true });
      return;
    }
    const created = await insertImprovement(client, req, {
      title: item.title,
      description: `Follow-up from ${row.major_number}: ${item.title}`,
      sourceType: 'postmortem',
      majorIncidentId,
      actionItemId,
    });
    item.improvement_id = created.id;
    await client.query(
      `UPDATE postmortems SET action_items = $2::jsonb, updated_at = now() WHERE id = $1`,
      [row.id, JSON.stringify(items)],
    );
    res.status(201).json({ ...created, already: false });
  } catch (err) {
    next(err);
  }
});

router.post('/from-change', validateBody(improvementFromChangeSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasChangeRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const changeId = (req.body as { change_id: string }).change_id;
    const existing = await client.query(
      `SELECT id, number FROM improvements
       WHERE tenant_id = current_tenant_id() AND source_type = 'change' AND change_id = $1
       LIMIT 1`,
      [changeId],
    );
    if (existing.rows[0]) {
      res.json({ ...existing.rows[0], already: true });
      return;
    }
    const change = await client.query(
      `SELECT number, title, success, failure_category, review_notes
       FROM changes WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [changeId],
    );
    const row = change.rows[0] as {
      number: string;
      title: string;
      success: boolean | null;
      failure_category: string | null;
      review_notes: string | null;
    } | undefined;
    if (!row) throw NotFound('Change not found');
    if (!changeImprovementAllowed(row.success)) {
      throw new AppError(400, 'Only an unsuccessful change can be registered as an improvement');
    }
    const notes = [row.failure_category, row.review_notes].filter(Boolean).join('\n\n');
    const created = await insertImprovement(client, req, {
      title: `Improve after ${row.number}: ${row.title}`,
      description: notes || null,
      sourceType: 'change',
      changeId,
    });
    res.status(201).json({ ...created, already: false });
  } catch (err) {
    next(err);
  }
});

router.post('/from-problem', validateBody(improvementFromProblemSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!hasProblemRole(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const problemId = (req.body as { problem_id: string }).problem_id;
    const existing = await client.query(
      `SELECT id, number FROM improvements
       WHERE tenant_id = current_tenant_id() AND source_type = 'problem' AND problem_id = $1
       LIMIT 1`,
      [problemId],
    );
    if (existing.rows[0]) {
      res.json({ ...existing.rows[0], already: true });
      return;
    }
    const problem = await client.query(
      `SELECT number, title, permanent_fix FROM problems WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [problemId],
    );
    const row = problem.rows[0] as { number: string; title: string; permanent_fix: string | null } | undefined;
    if (!row) throw NotFound('Problem not found');
    if (!problemImprovementAllowed(row.permanent_fix)) {
      throw new AppError(400, 'Record a permanent fix before registering an improvement');
    }
    const created = await insertImprovement(client, req, {
      title: `Improve ${row.number}: ${row.title}`,
      description: row.permanent_fix,
      sourceType: 'problem',
      problemId,
    });
    res.status(201).json({ ...created, already: false });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const row = await client.query(
      `${IMPROVEMENT_SELECT}
       WHERE i.tenant_id = current_tenant_id() AND i.id = $1`,
      [req.params.id],
    );
    if (row.rows.length === 0) throw NotFound('Improvement not found');
    res.json(row.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validateBody(updateImprovementSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const patch = parameterizedSet(IMPROVEMENT_UPDATE_COLUMNS, req.body || {});
    if (!patch) {
      res.json({ success: true });
      return;
    }
    const client = getRequestClient(req);
    const updated = await client.query(
      `UPDATE improvements
       SET ${patch.sets.join(', ')}
       WHERE tenant_id = current_tenant_id() AND id = $${patch.sets.length + 1}
       RETURNING *`,
      [...patch.values, req.params.id],
    );
    if (updated.rows.length === 0) throw NotFound('Improvement not found');
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
