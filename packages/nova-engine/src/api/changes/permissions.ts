/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Change permission / assignment-group services ───
// Plain-argument services (PoolClient + args). No Request/Response.
import type { PoolClient } from 'pg';
import {
  assignmentGroupServesProcess,
  isUserMemberOfAssignmentGroup,
  listAssignmentGroupsForProcess,
} from '../../domain/assignment-groups';
import type { ChangeActor } from './types';

export const CHANGE_PROCESS_NAME = 'Change Management';
const CHANGE_MEMBER_ROLE = 'change_manager';

export async function isChangeEnabledGroup(client: PoolClient, groupId: string): Promise<boolean> {
  return assignmentGroupServesProcess(client, groupId, CHANGE_PROCESS_NAME, CHANGE_MEMBER_ROLE);
}

type ChangePermissionRow = {
  assigned_to?: string | null;
  requested_by?: string | null;
  assignment_group_id?: string | null;
};

export async function canWorkOnChange(
  client: PoolClient,
  actor: ChangeActor,
  change: ChangePermissionRow,
): Promise<boolean> {
  if (actor.isAdmin) return true;
  if (change.assigned_to && change.assigned_to === actor.id) return true;
  if (change.requested_by === actor.id) return true;
  if (change.assignment_group_id) {
    if (await isUserMemberOfAssignmentGroup(client, change.assignment_group_id, actor.id)) {
      return true;
    }
  }
  return actor.hasChangeRole;
}

// ─── GET /api/changes/assignment-groups ───

export async function listChangeAssignmentGroups(
  client: PoolClient,
): Promise<Array<{ id: string; name: string }>> {
  const rows = await listAssignmentGroupsForProcess(client, CHANGE_PROCESS_NAME, CHANGE_MEMBER_ROLE);
  return rows.map(({ id, name }) => ({ id, name }));
}
