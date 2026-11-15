/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Admin: Assignment groups ───

import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../data/db';
import { authenticate, requireRole, setTenantRLS, releaseTenantClient } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';

const readRouter = Router();
const router = Router();

async function listAssignmentGroupsForTenant(tenantId: string) {
  return db.getMany(
    `SELECT ag.id, ag.name, ag.description, ag.is_active,
            ag.manager_id, ag.cost_center_id, ag.parent_group_id,
            ag.ola_response_hours, ag.ola_resolution_hours,
            ag.created_at, ag.updated_at,
            m.display_name AS manager_name,
            cc.name AS cost_center_name,
            cc.code AS cost_center_code,
            pg.name AS parent_group_name,
            (SELECT count(*) FROM assignment_group_members agm WHERE agm.group_id = ag.id)::int AS member_count,
            COALESCE(
              (SELECT json_agg(json_build_object('id', u.id, 'display_name', u.display_name) ORDER BY u.display_name)
               FROM assignment_group_members agm2
               JOIN users u ON u.id = agm2.user_id
               WHERE agm2.group_id = ag.id),
              '[]'::json
            ) AS members,
            COALESCE(
              (SELECT json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY p.name)
               FROM assignment_group_processes agp
               JOIN processes p ON p.id = agp.process_id
               WHERE agp.group_id = ag.id),
              '[]'::json
            ) AS processes,
            COALESCE(
              (SELECT json_agg(json_build_object('id', r.id, 'name', r.name) ORDER BY r.name)
               FROM assignment_group_roles agr
               JOIN roles r ON r.id = agr.role_id
               WHERE agr.group_id = ag.id),
              '[]'::json
            ) AS roles
     FROM assignment_groups ag
     LEFT JOIN users m ON m.id = ag.manager_id
     LEFT JOIN cost_centers cc ON cc.id = ag.cost_center_id
     LEFT JOIN assignment_groups pg ON pg.id = ag.parent_group_id
     WHERE ag.tenant_id = $1
     ORDER BY ag.name`,
    [tenantId],
  );
}

// Read-only for admin + fulfiller (used by assignment pickers and task flows)
readRouter.get(
  '/assignment-groups',
  authenticate,
  requireRole('admin', 'fulfiller', 'catalog_designer', 'on_call_admin', 'on_call'),
  setTenantRLS,
  releaseTenantClient,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await listAssignmentGroupsForTenant(req.user!.tenant_id);
      res.json({ assignment_groups: rows });
    } catch (err) { next(err); }
  },
);

// ════════════════════════════════════════════
// ASSIGNMENT GROUPS
// ════════════════════════════════════════════

function parseOlaHours(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 8760) {
    throw new AppError(400, 'OLA hours must be a whole number from 1 to 8760');
  }
  return n;
}

router.post('/assignment-groups', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const { name, description, manager_id, cost_center_id, parent_group_id, member_ids, process_ids, role_ids } = req.body;
    if (!name) throw new AppError(400, 'name is required');
    const olaResponseHours = parseOlaHours(req.body.ola_response_hours);
    const olaResolutionHours = parseOlaHours(req.body.ola_resolution_hours);

    const row = await db.getOne<{ id: string }>(
      `INSERT INTO assignment_groups (
         tenant_id, name, description, manager_id, cost_center_id, parent_group_id,
         ola_response_hours, ola_resolution_hours
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [tenantId, name, description || null, manager_id || null, cost_center_id || null, parent_group_id || null, olaResponseHours, olaResolutionHours],
    );

    const groupId = row!.id;

    if (Array.isArray(member_ids)) {
      for (const uid of member_ids) {
        await db.query(
          'INSERT INTO assignment_group_members (tenant_id, group_id, user_id) VALUES ($1, $2, $3)',
          [tenantId, groupId, uid],
        );
      }
    }

    if (Array.isArray(process_ids)) {
      for (const pid of process_ids) {
        await db.query(
          'INSERT INTO assignment_group_processes (tenant_id, group_id, process_id) VALUES ($1, $2, $3)',
          [tenantId, groupId, pid],
        );
      }
    }

    if (Array.isArray(role_ids)) {
      for (const rid of role_ids) {
        await db.query(
          'INSERT INTO assignment_group_roles (tenant_id, group_id, role_id) VALUES ($1, $2, $3)',
          [tenantId, groupId, rid],
        );
      }
    }

    res.status(201).json({ id: groupId });
  } catch (err) { next(err); }
});

router.patch('/assignment-groups/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenant_id;
    const groupId = req.params.id;
    const {
      name, description, manager_id, cost_center_id, parent_group_id, is_active, member_ids, process_ids, role_ids,
    } = req.body;

    const existing = await db.getOne<{ id: string }>(
      'SELECT id FROM assignment_groups WHERE id = $1 AND tenant_id = $2',
      [groupId, tenantId],
    );
    if (!existing) throw new AppError(404, 'Assignment group not found');

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
    if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description || null); }
    if (manager_id !== undefined) { sets.push(`manager_id = $${i++}`); vals.push(manager_id || null); }
    if (cost_center_id !== undefined) { sets.push(`cost_center_id = $${i++}`); vals.push(cost_center_id || null); }
    if (parent_group_id !== undefined) { sets.push(`parent_group_id = $${i++}`); vals.push(parent_group_id || null); }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(is_active); }
    if (Object.prototype.hasOwnProperty.call(req.body, 'ola_response_hours')) {
      sets.push(`ola_response_hours = $${i++}`);
      vals.push(parseOlaHours(req.body.ola_response_hours));
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'ola_resolution_hours')) {
      sets.push(`ola_resolution_hours = $${i++}`);
      vals.push(parseOlaHours(req.body.ola_resolution_hours));
    }

    if (sets.length > 0) {
      vals.push(groupId);
      await db.query(`UPDATE assignment_groups SET ${sets.join(', ')} WHERE id = $${i}`, vals);
    }

    if (Array.isArray(member_ids)) {
      await db.query('DELETE FROM assignment_group_members WHERE group_id = $1 AND tenant_id = $2', [groupId, tenantId]);
      for (const uid of member_ids) {
        await db.query(
          'INSERT INTO assignment_group_members (tenant_id, group_id, user_id) VALUES ($1, $2, $3)',
          [tenantId, groupId, uid],
        );
      }
    }

    if (Array.isArray(process_ids)) {
      await db.query('DELETE FROM assignment_group_processes WHERE group_id = $1 AND tenant_id = $2', [groupId, tenantId]);
      for (const pid of process_ids) {
        await db.query(
          'INSERT INTO assignment_group_processes (tenant_id, group_id, process_id) VALUES ($1, $2, $3)',
          [tenantId, groupId, pid],
        );
      }
    }

    if (Array.isArray(role_ids)) {
      await db.query('DELETE FROM assignment_group_roles WHERE group_id = $1 AND tenant_id = $2', [groupId, tenantId]);
      for (const rid of role_ids) {
        await db.query(
          'INSERT INTO assignment_group_roles (tenant_id, group_id, role_id) VALUES ($1, $2, $3)',
          [tenantId, groupId, rid],
        );
      }
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

// Broader-role read-only listing. Mounted by admin/routes.ts BEFORE the admin-only middleware.
export { readRouter as assignmentGroupsReadRouter };
export default router;
