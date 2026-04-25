/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Approvals Route ───────────────────────────
// GET /api/approvals/pending-count  → { count: N }
// GET /api/approvals                → list of pending approvals for current user

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, setTenantRLS, releaseTenantClient, getRequestClient } from '../../middleware/auth';

const router = Router();
router.use(authenticate, setTenantRLS, releaseTenantClient);

// ─── GET /api/approvals/pending-count ──────────────────────
router.get('/pending-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(`
      SELECT (
        -- Change approvals directly assigned to user
        (SELECT COUNT(*) FROM change_approvals
         WHERE tenant_id = current_tenant_id()
           AND approver_user_id = current_user_id()
           AND status = 'pending')
        +
        -- Change approvals via group membership
        (SELECT COUNT(*) FROM change_approvals ca
         JOIN assignment_group_members agm
           ON agm.group_id = ca.approver_group_id
          AND agm.tenant_id = current_tenant_id()
          AND agm.user_id = current_user_id()
         WHERE ca.tenant_id = current_tenant_id()
           AND ca.status = 'pending'
           AND ca.approver_user_id IS NULL)
        +
        -- KB article approvals via group membership
        (SELECT COUNT(*) FROM kb_article_approvals kaa
         JOIN assignment_group_members agm
           ON agm.group_id = kaa.assignment_group_id
          AND agm.tenant_id = current_tenant_id()
          AND agm.user_id = current_user_id()
         WHERE kaa.tenant_id = current_tenant_id()
           AND kaa.status = 'pending')
        +
        -- Request approval tasks (manager approval; subject = COALESCE(requested_for, requester_id))
        (SELECT COUNT(*) FROM request_tasks rt
         JOIN requests r ON r.id = rt.request_id
                       AND r.tenant_id = current_tenant_id()
         JOIN users subject_u ON subject_u.id = COALESCE(r.requested_for, r.requester_id)
         WHERE rt.tenant_id = current_tenant_id()
           AND rt.task_type = 'approval'
           AND rt.status = 'in_progress'
           AND rt.assigned_group_id IS NULL
           AND subject_u.manager_id = current_user_id()
           AND COALESCE(r.requested_for, r.requester_id) <> current_user_id())
        +
        -- Request approval tasks (group approval)
        (SELECT COUNT(*) FROM request_tasks rt
         JOIN assignment_group_members agm
           ON agm.group_id = rt.assigned_group_id
          AND agm.tenant_id = current_tenant_id()
          AND agm.user_id = current_user_id()
         WHERE rt.tenant_id = current_tenant_id()
           AND rt.task_type = 'approval'
           AND rt.status = 'in_progress'
           AND rt.assigned_group_id IS NOT NULL)
      )::int AS count
    `);
    res.json({ count: Number(result.rows[0]?.count ?? 0) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/approvals ─────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getRequestClient(req);
    const result = await client.query(`
      -- Change approvals (direct)
      SELECT
        'change'::text        AS type,
        ca.id::text           AS approval_id,
        ca.approval_type,
        c.id::text            AS entity_id,
        c.number              AS entity_number,
        c.title               AS entity_title,
        ca.created_at
      FROM change_approvals ca
      JOIN changes c ON c.id = ca.change_id
                    AND c.tenant_id = current_tenant_id()
      WHERE ca.tenant_id = current_tenant_id()
        AND ca.approver_user_id = current_user_id()
        AND ca.status = 'pending'

      UNION ALL

      -- Change approvals (via group)
      SELECT
        'change'::text,
        ca.id::text,
        ca.approval_type,
        c.id::text,
        c.number,
        c.title,
        ca.created_at
      FROM change_approvals ca
      JOIN changes c ON c.id = ca.change_id
                    AND c.tenant_id = current_tenant_id()
      JOIN assignment_group_members agm
        ON agm.group_id = ca.approver_group_id
       AND agm.tenant_id = current_tenant_id()
       AND agm.user_id = current_user_id()
      WHERE ca.tenant_id = current_tenant_id()
        AND ca.status = 'pending'
        AND ca.approver_user_id IS NULL

      UNION ALL

      -- KB article approvals (via group)
      SELECT
        'knowledge'::text,
        kaa.id::text,
        'knowledge_review'::text,
        ka.id::text,
        ka.number,
        ka.title,
        ka.created_at
      FROM kb_article_approvals kaa
      JOIN knowledge_articles ka ON ka.id = kaa.article_id
                                 AND ka.tenant_id = current_tenant_id()
      JOIN assignment_group_members agm
        ON agm.group_id = kaa.assignment_group_id
       AND agm.tenant_id = current_tenant_id()
       AND agm.user_id = current_user_id()
      WHERE kaa.tenant_id = current_tenant_id()
        AND kaa.status = 'pending'

      UNION ALL

      -- Request approval tasks (manager approval)
      SELECT
        'request'::text,
        rt.id::text AS approval_id,
        'manager'::text AS approval_type,
        r.id::text AS entity_id,
        r.number AS entity_number,
        COALESCE(si.name, rt.name, 'Request approval') AS entity_title,
        rt.created_at
      FROM request_tasks rt
      JOIN requests r ON r.id = rt.request_id
                    AND r.tenant_id = current_tenant_id()
      JOIN users subject_u ON subject_u.id = COALESCE(r.requested_for, r.requester_id)
      LEFT JOIN service_items si ON si.id = r.service_item_id
      WHERE rt.tenant_id = current_tenant_id()
        AND rt.task_type = 'approval'
        AND rt.status = 'in_progress'
        AND rt.assigned_group_id IS NULL
        AND subject_u.manager_id = current_user_id()
        AND COALESCE(r.requested_for, r.requester_id) <> current_user_id()

      UNION ALL

      -- Request approval tasks (group approval)
      SELECT
        'request'::text,
        rt.id::text AS approval_id,
        'group'::text AS approval_type,
        r.id::text AS entity_id,
        r.number AS entity_number,
        COALESCE(si.name, rt.name, 'Request approval') AS entity_title,
        rt.created_at
      FROM request_tasks rt
      JOIN requests r ON r.id = rt.request_id
                    AND r.tenant_id = current_tenant_id()
      LEFT JOIN service_items si ON si.id = r.service_item_id
      JOIN assignment_group_members agm
        ON agm.group_id = rt.assigned_group_id
       AND agm.tenant_id = current_tenant_id()
       AND agm.user_id = current_user_id()
      WHERE rt.tenant_id = current_tenant_id()
        AND rt.task_type = 'approval'
        AND rt.status = 'in_progress'
        AND rt.assigned_group_id IS NOT NULL

      ORDER BY created_at ASC
    `);
    res.json({ approvals: result.rows });
  } catch (err) {
    next(err);
  }
});

export default router;
