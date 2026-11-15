/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Change permission / assignment-group services ───
// Plain-argument services (PoolClient + args). No Request/Response.
import type { PoolClient } from 'pg';
import type { ChangeActor } from './types';

export const CHANGE_PROCESS_NAME = 'Change Management';

export async function isChangeEnabledGroup(client: PoolClient, groupId: string): Promise<boolean> {
  const row = await client.query(
    `SELECT 1
     FROM assignment_groups ag
     WHERE ag.tenant_id = current_tenant_id()
       AND ag.id = $1
       AND (
         EXISTS (
           SELECT 1
           FROM assignment_group_processes agp
           JOIN processes p ON p.id = agp.process_id
           WHERE agp.tenant_id = current_tenant_id()
             AND agp.group_id = ag.id
             AND p.tenant_id = current_tenant_id()
             AND p.is_active = true
             AND p.name = $2
         )
         OR EXISTS (
           SELECT 1
           FROM assignment_group_members agm
           JOIN user_roles ur ON ur.user_id = agm.user_id AND ur.tenant_id = current_tenant_id()
           JOIN roles r ON r.id = ur.role_id AND r.tenant_id = current_tenant_id()
           WHERE agm.tenant_id = current_tenant_id()
             AND agm.group_id = ag.id
             AND r.name = 'change_manager'
             AND r.is_active = true
         )
       )`,
    [groupId, CHANGE_PROCESS_NAME],
  );
  return row.rows.length > 0;
}

export async function canWorkOnChange(
  client: PoolClient,
  actor: ChangeActor,
  change: any,
): Promise<boolean> {
  if (actor.isAdmin) return true;
  if (change.assigned_to && change.assigned_to === actor.id) return true;
  if (change.requested_by === actor.id) return true;
  if (change.assignment_group_id) {
    const m = await client.query(
      `SELECT 1 FROM assignment_group_members
       WHERE tenant_id = current_tenant_id()
         AND group_id = $1
         AND user_id = $2
       LIMIT 1`,
      [change.assignment_group_id, actor.id],
    );
    if (m.rows.length > 0) return true;
  }
  return actor.hasChangeRole;
}

// ─── GET /api/changes/assignment-groups ───

export async function listChangeAssignmentGroups(
  client: PoolClient,
): Promise<Array<{ id: string; name: string }>> {
  const rows = await client.query(
    `SELECT ag.id, ag.name
       FROM assignment_groups ag
       WHERE ag.tenant_id = current_tenant_id()
         AND ag.is_active = true
         AND (
           EXISTS (
             SELECT 1
             FROM assignment_group_processes agp
             JOIN processes p ON p.id = agp.process_id
             WHERE agp.tenant_id = current_tenant_id()
               AND agp.group_id = ag.id
               AND p.tenant_id = current_tenant_id()
               AND p.is_active = true
               AND p.name = $1
           )
           OR EXISTS (
             SELECT 1
             FROM assignment_group_members agm
             JOIN user_roles ur ON ur.user_id = agm.user_id AND ur.tenant_id = current_tenant_id()
             JOIN roles r ON r.id = ur.role_id AND r.tenant_id = current_tenant_id()
             WHERE agm.tenant_id = current_tenant_id()
               AND agm.group_id = ag.id
               AND r.name = 'change_manager'
               AND r.is_active = true
           )
         )
       ORDER BY ag.name`,
    [CHANGE_PROCESS_NAME],
  );
  return rows.rows;
}
