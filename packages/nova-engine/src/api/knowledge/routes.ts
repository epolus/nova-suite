/* SPDX-License-Identifier: AGPL-3.0-only */
import { Router, Request, Response, NextFunction } from 'express';
import { validateQuery } from '../../middleware/validate';
import {
  authenticate,
  getRequestClient,
  releaseTenantClient,
  setTenantRLS,
} from '../../middleware/auth';
import { AppError, NotFound } from '../../middleware/errorHandler';
import { rankedSuggestionsQuerySchema } from '../../domain/schemas';
import {
  signalKnowledgeApprovalDecision,
} from '../../temporal/workflows';
import {
  enqueueKnowledgeApprovalStartJob,
  enqueueNotificationDispatchStartJob,
} from '../../temporal/workflow-start-queue';
import { hasKnowledgeRole, isAdminRole, isFulfillerRole } from '../roles';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

function canManageKnowledge(req: Request): boolean {
  return hasKnowledgeRole(req);
}

function isAdmin(req: Request): boolean {
  return isAdminRole(req);
}

async function publishArticleAndRetirePrevious(client: any, articleId: string): Promise<void> {
  const article = await client.query(
    `SELECT id, COALESCE(root_article_id, id) AS root_id
     FROM knowledge_articles
     WHERE id = $1 AND tenant_id = current_tenant_id()`,
    [articleId],
  );
  if (article.rows.length === 0) throw NotFound('Knowledge article not found');
  const rootId = article.rows[0].root_id;

  await client.query(
    `UPDATE knowledge_articles
     SET status = 'published'
     WHERE id = $1 AND tenant_id = current_tenant_id()`,
    [articleId],
  );

  // Only one published version per version chain.
  await client.query(
    `UPDATE knowledge_articles
     SET status = 'retired'
     WHERE tenant_id = current_tenant_id()
       AND status = 'published'
       AND id <> $1
       AND (id = $2 OR root_article_id = $2)`,
    [articleId, rootId],
  );
}

router.get('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT c.id, c.name, c.description, c.parent_id, p.name AS parent_name, c.is_active, c.created_at, c.updated_at
       FROM knowledge_categories c
       LEFT JOIN knowledge_categories p ON p.id = c.parent_id
       WHERE c.tenant_id = current_tenant_id()
       ORDER BY COALESCE(p.name, c.name), CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END, c.name`,
    );
    res.json({ categories: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isAdmin(req)) throw new AppError(403, 'Only admins can manage categories');
    const client = getRequestClient(req);
    const { name, description, parent_id, is_active } = req.body || {};
    if (!name) throw new AppError(400, 'name is required');
    if (parent_id) {
      const parent = await client.query(
        `SELECT id FROM knowledge_categories WHERE id = $1 AND tenant_id = current_tenant_id()`,
        [parent_id],
      );
      if (parent.rows.length === 0) throw new AppError(400, 'parent_id not found');
    }
    const row = await client.query(
      `INSERT INTO knowledge_categories (tenant_id, name, description, parent_id, is_active)
       VALUES (current_tenant_id(), $1, $2, $3, COALESCE($4, true))
       RETURNING id`,
      [name, description || null, parent_id || null, is_active],
    );
    res.status(201).json({ id: row.rows[0].id });
  } catch (err) {
    next(err);
  }
});

router.patch('/categories/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isAdmin(req)) throw new AppError(403, 'Only admins can manage categories');
    const client = getRequestClient(req);
    const id = String(req.params.id);
    const { name, description, parent_id, is_active } = req.body || {};
    if (parent_id === id) throw new AppError(400, 'Category cannot be its own parent');
    if (parent_id) {
      const parent = await client.query(
        `SELECT id FROM knowledge_categories WHERE id = $1 AND tenant_id = current_tenant_id()`,
        [parent_id],
      );
      if (parent.rows.length === 0) throw new AppError(400, 'parent_id not found');
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
    if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description || null); }
    if (parent_id !== undefined) { sets.push(`parent_id = $${i++}`); vals.push(parent_id || null); }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }
    if (sets.length === 0) return void res.json({ success: true });
    vals.push(id);
    await client.query(
      `UPDATE knowledge_categories
       SET ${sets.join(', ')}
       WHERE id = $${i} AND tenant_id = current_tenant_id()`,
      vals,
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/categories/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isAdmin(req)) throw new AppError(403, 'Only admins can manage categories');
    const client = getRequestClient(req);
    await client.query(
      `DELETE FROM knowledge_categories WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [String(req.params.id)],
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/assignment-groups', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageKnowledge(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT id, name, is_active
       FROM assignment_groups
       WHERE tenant_id = current_tenant_id()
       ORDER BY name`,
    );
    res.json({ assignment_groups: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/workflows', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageKnowledge(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT w.*, c.name AS category_name
       FROM kb_approval_workflows w
       LEFT JOIN knowledge_categories c ON c.id = w.category_id
       WHERE w.tenant_id = current_tenant_id()
       ORDER BY w.sort_order, w.name`,
    );
    res.json({ workflows: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/workflows', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageKnowledge(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const { name, category_id, steps, sort_order } = req.body || {};
    if (!name) throw new AppError(400, 'name is required');
    if (!Array.isArray(steps) || steps.length === 0) throw new AppError(400, 'steps is required');
    const normalizedSteps = steps.map((s: any, idx: number) => ({
      step_order: idx + 1,
      assignment_group_id: s.assignment_group_id,
    }));
    const row = await client.query(
      `INSERT INTO kb_approval_workflows (tenant_id, name, category_id, steps, sort_order)
       VALUES (current_tenant_id(), $1, $2, $3, $4)
       RETURNING id`,
      [name, category_id || null, JSON.stringify(normalizedSteps), sort_order ?? 100],
    );
    res.status(201).json({ id: row.rows[0].id });
  } catch (err) {
    next(err);
  }
});

router.patch('/workflows/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageKnowledge(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    const { name, category_id, steps, is_active, sort_order } = req.body || {};
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
    if (category_id !== undefined) { sets.push(`category_id = $${i++}`); vals.push(category_id || null); }
    if (steps !== undefined) {
      const normalizedSteps = Array.isArray(steps)
        ? steps.map((s: any, idx: number) => ({ step_order: idx + 1, assignment_group_id: s.assignment_group_id }))
        : [];
      sets.push(`steps = $${i++}`);
      vals.push(JSON.stringify(normalizedSteps));
    }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }
    if (sort_order !== undefined) { sets.push(`sort_order = $${i++}`); vals.push(sort_order); }
    if (sets.length === 0) return void res.json({ success: true });
    vals.push(req.params.id);
    await client.query(
      `UPDATE kb_approval_workflows
       SET ${sets.join(', ')}
       WHERE id = $${i} AND tenant_id = current_tenant_id()`,
      vals,
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/workflows/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageKnowledge(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);
    await client.query(
      `DELETE FROM kb_approval_workflows WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [req.params.id],
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/articles', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const conditions: string[] = [`a.tenant_id = current_tenant_id()`];
    const params: unknown[] = [];
    let idx = 1;
    if (req.query.status) {
      conditions.push(`a.status = $${idx++}`);
      params.push(req.query.status);
    }
    if (req.query.category_id) {
      conditions.push(`a.category_id = $${idx++}`);
      params.push(req.query.category_id);
    }
    if (req.query.search) {
      conditions.push(`(a.number ILIKE $${idx} OR a.title ILIKE $${idx} OR a.content ILIKE $${idx})`);
      params.push(`%${req.query.search}%`);
      idx++;
    }
    if (!canManageKnowledge(req) || req.query.only_published === 'true') {
      conditions.push(`a.status = 'published'`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const rows = await client.query(
      `SELECT a.*, u.display_name AS author_name, c.name AS category_name, ag.name AS assignment_group_name,
              COALESCE(p.pending_count, 0)::int AS pending_approval_count
       FROM knowledge_articles a
       LEFT JOIN users u ON u.id = a.author_id
       LEFT JOIN knowledge_categories c ON c.id = a.category_id
       LEFT JOIN assignment_groups ag ON ag.id = a.assignment_group_id
       LEFT JOIN (
         SELECT article_id, count(*) AS pending_count
         FROM kb_article_approvals
         WHERE status = 'pending'
         GROUP BY article_id
       ) p ON p.article_id = a.id
       ${where}
       ORDER BY a.updated_at DESC`,
      params,
    );
    res.json({ articles: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/articles/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const article = await client.query(
      `SELECT a.*, u.display_name AS author_name, c.name AS category_name, ag.name AS assignment_group_name
       FROM knowledge_articles a
       LEFT JOIN users u ON u.id = a.author_id
       LEFT JOIN knowledge_categories c ON c.id = a.category_id
       LEFT JOIN assignment_groups ag ON ag.id = a.assignment_group_id
       WHERE a.id = $1 AND a.tenant_id = current_tenant_id()`,
      [req.params.id],
    );
    if (article.rows.length === 0) throw NotFound('Knowledge article not found');
    if (!canManageKnowledge(req) && article.rows[0].status !== 'published') {
      throw new AppError(403, 'Insufficient permissions');
    }

    await client.query(
      `UPDATE knowledge_articles
       SET view_count = view_count + 1
       WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [req.params.id],
    );

    const approvals = await client.query(
      `SELECT ap.*, ag.name AS assignment_group_name, u.display_name AS decided_by_name
       FROM kb_article_approvals ap
       JOIN assignment_groups ag ON ag.id = ap.assignment_group_id
       LEFT JOIN users u ON u.id = ap.decided_by
       WHERE ap.article_id = $1
       ORDER BY ap.step_order`,
      [req.params.id],
    );

    const rootId = article.rows[0].root_article_id || article.rows[0].id;
    const versionConditions = [
      `tenant_id = current_tenant_id()`,
      `(id = $1 OR root_article_id = $1)`,
    ];
    if (!canManageKnowledge(req)) {
      versionConditions.push(`status = 'published'`);
    }
    const versions = await client.query(
      `SELECT id, number, status, version_no, updated_at
       FROM knowledge_articles
       WHERE ${versionConditions.join(' AND ')}
       ORDER BY version_no DESC, updated_at DESC`,
      [rootId],
    );

    res.json({ ...article.rows[0], approvals: approvals.rows, versions: versions.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/articles', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageKnowledge(req)) throw new AppError(403, 'Only knowledge role can create articles');
    const client = getRequestClient(req);
    const { title, content, category_id, assignment_group_id, meta_data } = req.body || {};
    if (!title || !content) throw new AppError(400, 'title and content are required');
    const seq = await client.query(`SELECT nextval('incident_number_seq') AS n`);
    const number = `KB${String(seq.rows[0].n).padStart(7, '0')}`;
    const row = await client.query(
      `INSERT INTO knowledge_articles
       (tenant_id, number, title, content, category_id, assignment_group_id, version_no, status, author_id, meta_data)
       VALUES (current_tenant_id(), $1, $2, $3, $4, $5, 1, 'draft', $6, $7)
       RETURNING id`,
      [number, title, content, category_id || null, assignment_group_id || null, req.user!.id, JSON.stringify(meta_data || {})],
    );
    res.status(201).json({ id: row.rows[0].id });
  } catch (err) {
    next(err);
  }
});

router.patch('/articles/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const existing = await client.query(
      `SELECT id, author_id, status FROM knowledge_articles
       WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [req.params.id],
    );
    if (existing.rows.length === 0) throw NotFound('Knowledge article not found');
    const isAuthor = existing.rows[0].author_id === req.user!.id;
    if (!isAuthor && !canManageKnowledge(req)) throw new AppError(403, 'Insufficient permissions');

    const isPublished = existing.rows[0].status === 'published';
    if (isPublished) {
      const keys = Object.keys(req.body || {});
      const retireOnly = keys.length === 1 && keys[0] === 'status' && req.body.status === 'retired';
      if (!retireOnly) {
        throw new AppError(400, 'Published articles are read-only. Create a new version to edit content.');
      }
    }

    const { title, content, category_id, assignment_group_id, status, meta_data } = req.body || {};
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (title !== undefined) { sets.push(`title = $${i++}`); vals.push(title); }
    if (content !== undefined) { sets.push(`content = $${i++}`); vals.push(content); }
    if (category_id !== undefined) { sets.push(`category_id = $${i++}`); vals.push(category_id || null); }
    if (assignment_group_id !== undefined) { sets.push(`assignment_group_id = $${i++}`); vals.push(assignment_group_id || null); }
    if (status !== undefined) { sets.push(`status = $${i++}`); vals.push(status); }
    if (meta_data !== undefined) { sets.push(`meta_data = $${i++}`); vals.push(JSON.stringify(meta_data || {})); }
    if (sets.length === 0) return void res.json({ success: true });
    vals.push(req.params.id);
    await client.query(
      `UPDATE knowledge_articles SET ${sets.join(', ')} WHERE id = $${i} AND tenant_id = current_tenant_id()`,
      vals,
    );
    if (status === 'published') {
      await publishArticleAndRetirePrevious(client, String(req.params.id));
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/articles/:id/new-version', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!canManageKnowledge(req)) throw new AppError(403, 'Insufficient permissions');
    const client = getRequestClient(req);

    const srcRes = await client.query(
      `SELECT *
       FROM knowledge_articles
       WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [req.params.id],
    );
    if (srcRes.rows.length === 0) throw NotFound('Knowledge article not found');
    const src = srcRes.rows[0];
    if (src.status !== 'published') {
      throw new AppError(400, 'Only published articles can be versioned');
    }

    const rootId = src.root_article_id || src.id;
    const ver = await client.query(
      `SELECT COALESCE(max(version_no), 1) AS max_version
       FROM knowledge_articles
       WHERE tenant_id = current_tenant_id()
         AND (id = $1 OR root_article_id = $1)`,
      [rootId],
    );
    const nextVersion = Number(ver.rows[0]?.max_version || 1) + 1;
    const baseNumber = String(src.number).replace(/-v\d+$/i, '');
    const newNumber = `${baseNumber}-v${nextVersion}`;

    const created = await client.query(
      `INSERT INTO knowledge_articles
       (tenant_id, number, title, content, category_id, assignment_group_id, root_article_id, previous_version_id, version_no, status, author_id, meta_data)
       VALUES
       (current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10)
       RETURNING id`,
      [
        newNumber,
        src.title,
        src.content,
        src.category_id || null,
        src.assignment_group_id || null,
        rootId,
        src.id,
        nextVersion,
        req.user!.id,
        src.meta_data || {},
      ],
    );

    res.status(201).json({ id: created.rows[0].id });
  } catch (err) {
    next(err);
  }
});

router.post('/articles/:id/submit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const articleResult = await client.query(
      `SELECT id, category_id, status FROM knowledge_articles
       WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [req.params.id],
    );
    if (articleResult.rows.length === 0) throw NotFound('Knowledge article not found');
    const article = articleResult.rows[0];

    if (!canManageKnowledge(req)) throw new AppError(403, 'Insufficient permissions');
    if (article.status === 'published') return void res.json({ success: true, message: 'Already published' });

    const wf = await client.query(
      `SELECT id, steps
       FROM kb_approval_workflows
       WHERE tenant_id = current_tenant_id()
         AND is_active = true
         AND (category_id = $1 OR category_id IS NULL)
       ORDER BY CASE WHEN category_id = $1 THEN 0 ELSE 1 END, sort_order, name
       LIMIT 1`,
      [article.category_id || null],
    );

    await client.query(`DELETE FROM kb_article_approvals WHERE article_id = $1`, [req.params.id]);

    if (wf.rows.length === 0) {
      await publishArticleAndRetirePrevious(client, String(req.params.id));
      enqueueNotificationDispatchStartJob({
        tenantId: req.user!.tenant_id,
        entityType: 'knowledge',
        triggerKey: 'knowledge.published',
        entityId: String(req.params.id),
        actorUserId: req.user!.id,
      }).catch(() => {});
      return void res.json({ success: true, status: 'published' });
    }

    const steps = Array.isArray(wf.rows[0].steps) ? wf.rows[0].steps : [];
    if (steps.length === 0) {
      await publishArticleAndRetirePrevious(client, String(req.params.id));
      enqueueNotificationDispatchStartJob({
        tenantId: req.user!.tenant_id,
        entityType: 'knowledge',
        triggerKey: 'knowledge.published',
        entityId: String(req.params.id),
        actorUserId: req.user!.id,
      }).catch(() => {});
      return void res.json({ success: true, status: 'published' });
    }

    await client.query(
      `UPDATE knowledge_articles SET status = 'review' WHERE id = $1 AND tenant_id = current_tenant_id()`,
      [req.params.id],
    );

    for (const step of steps) {
      await client.query(
        `INSERT INTO kb_article_approvals
         (article_id, tenant_id, step_order, assignment_group_id, status)
         VALUES ($1, current_tenant_id(), $2, $3, 'pending')`,
        [req.params.id, step.step_order, step.assignment_group_id],
      );
    }

    await enqueueKnowledgeApprovalStartJob({
      articleId: String(req.params.id),
      tenantId: req.user!.tenant_id,
      steps: steps.map((s: any) => ({
        step_order: Number(s.step_order),
        assignment_group_id: String(s.assignment_group_id),
      })),
    });

    enqueueNotificationDispatchStartJob({
      tenantId: req.user!.tenant_id,
      entityType: 'knowledge',
      triggerKey: 'knowledge.submitted_for_review',
      entityId: String(req.params.id),
      actorUserId: req.user!.id,
    }).catch(() => {});

    res.json({ success: true, status: 'review' });
  } catch (err) {
    next(err);
  }
});

router.post('/articles/:id/approvals/:approvalId/decision', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const { decision, notes } = req.body || {};
    const normalizedDecision = decision === 'approved' || decision === 'rejected' ? decision : null;
    if (!normalizedDecision) throw new AppError(400, 'decision must be approved or rejected');

    const approval = await client.query(
      `SELECT ap.*, a.status AS article_status
       FROM kb_article_approvals ap
       JOIN knowledge_articles a ON a.id = ap.article_id
       WHERE ap.id = $1 AND ap.article_id = $2 AND ap.tenant_id = current_tenant_id()`,
      [req.params.approvalId, req.params.id],
    );
    if (approval.rows.length === 0) throw NotFound('Approval step not found');
    const row = approval.rows[0];
    if (row.status !== 'pending') throw new AppError(400, 'Approval already decided');

    const isAdmin = isAdminRole(req);
    const member = await client.query(
      `SELECT 1 FROM assignment_group_members
       WHERE group_id = $1 AND user_id = $2
       LIMIT 1`,
      [row.assignment_group_id, req.user!.id],
    );
    if (!isAdmin && member.rows.length === 0) throw new AppError(403, 'Only assigned group members can approve');

    await client.query(
      `UPDATE kb_article_approvals
       SET status = $1, decided_by = $2, decided_at = now(), notes = $3
       WHERE id = $4`,
      [normalizedDecision, req.user!.id, notes || null, row.id],
    );

    await signalKnowledgeApprovalDecision(String(req.params.id), Number(row.step_order), normalizedDecision);
    if (normalizedDecision === 'rejected') {
      enqueueNotificationDispatchStartJob({
        tenantId: req.user!.tenant_id,
        entityType: 'knowledge',
        triggerKey: 'knowledge.rejected',
        entityId: String(req.params.id),
        actorUserId: req.user!.id,
      }).catch(() => {});
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/incidents/:incidentId/suggestions',
  validateQuery(rankedSuggestionsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getRequestClient(req);
      const incidentId = String(req.params.incidentId);
      const limit = Number((req.query as Record<string, unknown>).limit ?? 5);

      const incidentRes = await client.query(
        `SELECT i.id, i.caller_id, i.title, i.description, i.category, i.subcategory, s.name AS service_name
         FROM incidents i
         LEFT JOIN services s ON s.id = i.service_id
         WHERE i.id = $1::uuid`,
        [incidentId],
      );
      if (incidentRes.rows.length === 0) throw NotFound('Incident not found');

      const incident = incidentRes.rows[0];
      const isFulfiller = isFulfillerRole(req);
      if (!isFulfiller && incident.caller_id !== req.user!.id) {
        throw new AppError(403, 'Insufficient permissions');
      }

      const suggestions = await client.query(
        `WITH ctx AS (
           SELECT
             $1::uuid AS incident_id,
             COALESCE($2::text, '') AS title,
             COALESCE($3::text, '') AS description,
             COALESCE($4::text, '') AS category,
             COALESCE($5::text, '') AS subcategory,
             COALESCE($6::text, '') AS service_name
         ),
         usage_stats AS (
           SELECT
             r.kb_id,
             COUNT(*)::int AS total_resolutions,
             COUNT(*) FILTER (WHERE COALESCE(i.category, '') = (SELECT category FROM ctx))::int AS same_category_resolutions,
             COUNT(*) FILTER (
               WHERE COALESCE(s.name, '') = (SELECT service_name FROM ctx)
             )::int AS same_service_resolutions
           FROM incident_kb_resolutions r
           JOIN incidents i ON i.id = r.incident_id
           LEFT JOIN services s ON s.id = i.service_id
           GROUP BY r.kb_id
         ),
         ranked AS (
           SELECT
             a.id,
             a.number,
             a.title,
             LEFT(COALESCE(a.content, ''), 260) AS excerpt,
             a.category_id,
             kc.name AS category_name,
             a.updated_at,
             a.view_count,
             COALESCE(u.total_resolutions, 0)::int AS resolution_count,
             (
               LEAST(COALESCE(u.total_resolutions, 0) * 2, 18)
               + LEAST(COALESCE(u.same_category_resolutions, 0) * 8, 24)
               + LEAST(COALESCE(u.same_service_resolutions, 0) * 8, 24)
               + CASE
                 WHEN (SELECT category FROM ctx) <> ''
                      AND kc.name IS NOT NULL
                      AND (kc.name ILIKE (SELECT category FROM ctx)
                        OR kc.name ILIKE ('%' || (SELECT category FROM ctx) || '%'))
                 THEN 10 ELSE 0
               END
               + CASE
                 WHEN (SELECT service_name FROM ctx) <> ''
                      AND (
                        a.title ILIKE ('%' || (SELECT service_name FROM ctx) || '%')
                        OR a.content ILIKE ('%' || (SELECT service_name FROM ctx) || '%')
                      )
                 THEN 8 ELSE 0
               END
               + (
                 ts_rank_cd(
                   to_tsvector('simple', COALESCE(a.title, '') || ' ' || COALESCE(a.content, '')),
                   plainto_tsquery(
                     'simple',
                     TRIM(CONCAT_WS(
                       ' ',
                       (SELECT title FROM ctx),
                       (SELECT description FROM ctx),
                       (SELECT category FROM ctx),
                       (SELECT subcategory FROM ctx),
                       (SELECT service_name FROM ctx)
                     ))
                   )
                 ) * 30
               )
             )::numeric(10, 2) AS suggestion_score
           FROM knowledge_articles a
           LEFT JOIN knowledge_categories kc ON kc.id = a.category_id
           LEFT JOIN usage_stats u ON u.kb_id = a.id
           WHERE a.tenant_id = current_tenant_id()
             AND a.status = 'published'
         )
         SELECT *
         FROM ranked
         ORDER BY suggestion_score DESC, resolution_count DESC, updated_at DESC
         LIMIT $7::int`,
        [
          incident.id,
          incident.title,
          incident.description,
          incident.category,
          incident.subcategory,
          incident.service_name,
          limit,
        ],
      );

      res.json({ articles: suggestions.rows });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/incidents/:incidentId/resolutions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const rows = await client.query(
      `SELECT r.*, a.number AS kb_number, a.title AS kb_title, a.status AS kb_status, u.display_name AS resolved_by_name
       FROM incident_kb_resolutions r
       JOIN knowledge_articles a ON a.id = r.kb_id
       LEFT JOIN users u ON u.id = r.resolved_by
       WHERE r.incident_id = $1 AND a.tenant_id = current_tenant_id()
       ORDER BY r.applied_at DESC`,
      [req.params.incidentId],
    );
    res.json({ resolutions: rows.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/incidents/:incidentId/resolutions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const { kb_id } = req.body || {};
    if (!kb_id) throw new AppError(400, 'kb_id is required');
    const kb = await client.query(
      `SELECT id FROM knowledge_articles
       WHERE id = $1 AND tenant_id = current_tenant_id() AND status = 'published'`,
      [kb_id],
    );
    if (kb.rows.length === 0) throw NotFound('Published article not found');
    await client.query(
      `INSERT INTO incident_kb_resolutions (incident_id, kb_id, resolved_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (incident_id, kb_id) DO NOTHING`,
      [req.params.incidentId, kb_id, req.user!.id],
    );
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/knowledge/articles/:id/ratings ───
router.get('/articles/:id/ratings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const row = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE rating = 1)::int AS thumbs_up,
         COUNT(*) FILTER (WHERE rating = -1)::int AS thumbs_down,
         (SELECT rating FROM kb_article_ratings WHERE article_id = $1 AND user_id = $2 LIMIT 1) AS my_rating
       FROM kb_article_ratings
       WHERE article_id = $1 AND tenant_id = current_tenant_id()`,
      [req.params.id, req.user!.id],
    );
    res.json({ thumbs_up: row.rows[0].thumbs_up, thumbs_down: row.rows[0].thumbs_down, my_rating: row.rows[0].my_rating ?? null });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/knowledge/articles/:id/rate ───
router.post('/articles/:id/rate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const { rating } = req.body || {};
    if (rating !== 1 && rating !== -1 && rating !== null) {
      throw new AppError(400, 'rating must be 1, -1, or null (to remove)');
    }
    if (rating === null) {
      await client.query(
        `DELETE FROM kb_article_ratings WHERE article_id = $1 AND user_id = $2 AND tenant_id = current_tenant_id()`,
        [req.params.id, req.user!.id],
      );
    } else {
      await client.query(
        `INSERT INTO kb_article_ratings (article_id, user_id, tenant_id, rating)
         VALUES ($1, $2, current_tenant_id(), $3)
         ON CONFLICT (article_id, user_id) DO UPDATE SET rating = EXCLUDED.rating`,
        [req.params.id, req.user!.id, rating],
      );
    }
    // Return updated counts
    const row = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE rating = 1)::int AS thumbs_up,
         COUNT(*) FILTER (WHERE rating = -1)::int AS thumbs_down
       FROM kb_article_ratings
       WHERE article_id = $1 AND tenant_id = current_tenant_id()`,
      [req.params.id],
    );
    res.json({ thumbs_up: row.rows[0].thumbs_up, thumbs_down: row.rows[0].thumbs_down, my_rating: rating });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/knowledge/suggestions-by-text ───
router.get('/suggestions-by-text', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const title = String((req.query as Record<string, unknown>).title ?? '');
    const description = String((req.query as Record<string, unknown>).description ?? '');
    const category = String((req.query as Record<string, unknown>).category ?? '');
    const limit = Math.min(Number((req.query as Record<string, unknown>).limit ?? 6), 20);

    const suggestions = await client.query(
      `WITH ranked AS (
         SELECT
           a.id, a.number, a.title,
           LEFT(COALESCE(a.content, ''), 260) AS excerpt,
           a.category_id,
           kc.name AS category_name,
           a.updated_at, a.view_count, 0::int AS resolution_count,
           (
             CASE
               WHEN $3::text <> '' AND kc.name IS NOT NULL
                    AND (kc.name ILIKE $3 OR kc.name ILIKE ('%' || $3 || '%'))
               THEN 10 ELSE 0
             END
             + (
               ts_rank_cd(
                 to_tsvector('simple', COALESCE(a.title, '') || ' ' || COALESCE(a.content, '')),
                 plainto_tsquery('simple', TRIM(CONCAT_WS(' ', $1::text, $2::text, $3::text)))
               ) * 30
             )
           )::numeric(10, 2) AS suggestion_score
         FROM knowledge_articles a
         LEFT JOIN knowledge_categories kc ON kc.id = a.category_id
         WHERE a.tenant_id = current_tenant_id()
           AND a.status = 'published'
       )
       SELECT * FROM ranked
       WHERE suggestion_score > 0
       ORDER BY suggestion_score DESC, updated_at DESC
       LIMIT $4::int`,
      [title, description, category, limit],
    );

    res.json({ articles: suggestions.rows });
  } catch (err) {
    next(err);
  }
});

export default router;
