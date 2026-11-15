/* SPDX-License-Identifier: AGPL-3.0-only */
// Shared assignment-group enablement and membership lookups used by change,
// problem and major-incident flows. Callers keep process-specific canWorkOn*
// rules; this module owns the repeated SQL only.

import type { PoolClient } from 'pg';

export type AssignmentGroupListRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

/**
 * True when the group is linked to `processName`, or has an active member with
 * `memberRole`. Optionally requires the group itself to be active (major-incident
 * follow-ups); change/problem enablement checks historically omit that flag.
 */
export async function assignmentGroupServesProcess(
  client: PoolClient,
  groupId: string,
  processName: string,
  memberRole: string,
  opts: { requireActiveGroup?: boolean } = {},
): Promise<boolean> {
  const row = await client.query(
    `SELECT 1
     FROM assignment_groups ag
     WHERE ag.tenant_id = current_tenant_id()
       AND ag.id = $1
       AND ($4::boolean IS NOT TRUE OR ag.is_active = true)
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
             AND r.name = $3
             AND r.is_active = true
         )
       )
     LIMIT 1`,
    [groupId, processName, memberRole, opts.requireActiveGroup === true],
  );
  return row.rows.length > 0;
}

/** Active groups that serve a process (or host the given member role). */
export async function listAssignmentGroupsForProcess(
  client: PoolClient,
  processName: string,
  memberRole: string,
): Promise<AssignmentGroupListRow[]> {
  const rows = await client.query<AssignmentGroupListRow>(
    `SELECT ag.id, ag.name, ag.description, ag.is_active
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
             AND r.name = $2
             AND r.is_active = true
         )
       )
     ORDER BY ag.name`,
    [processName, memberRole],
  );
  return rows.rows;
}

/** Tenant-scoped membership check used by canWorkOn* and approval decisions. */
export async function isUserMemberOfAssignmentGroup(
  client: PoolClient,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const m = await client.query(
    `SELECT 1 FROM assignment_group_members
     WHERE tenant_id = current_tenant_id()
       AND group_id = $1
       AND user_id = $2
     LIMIT 1`,
    [groupId, userId],
  );
  return m.rows.length > 0;
}
