/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Problem permission / assignment-group services ───
import type { PoolClient } from 'pg';
import {
  assignmentGroupServesProcess,
  isUserMemberOfAssignmentGroup,
  listAssignmentGroupsForProcess,
  type AssignmentGroupListRow,
} from '../../domain/assignment-groups';

export const PROBLEM_PROCESS_NAME = 'Problem Management';
const PROBLEM_MEMBER_ROLE = 'problem';

export type ProblemWorkActor = {
  id: string;
  isAdmin: boolean;
  hasElevatedProblemRole: boolean;
};

export async function isProblemEnabledGroup(client: PoolClient, groupId: string): Promise<boolean> {
  return assignmentGroupServesProcess(client, groupId, PROBLEM_PROCESS_NAME, PROBLEM_MEMBER_ROLE);
}

export async function canWorkOnProblem(
  client: PoolClient,
  actor: ProblemWorkActor,
  problem: { assignment_group_id?: string | null; reported_by?: string | null },
): Promise<boolean> {
  if (actor.isAdmin) return true;

  if (problem.assignment_group_id) {
    return isUserMemberOfAssignmentGroup(client, problem.assignment_group_id, actor.id);
  }

  if (problem.reported_by === actor.id) return true;
  return actor.hasElevatedProblemRole;
}

export async function listProblemAssignmentGroups(
  client: PoolClient,
): Promise<AssignmentGroupListRow[]> {
  return listAssignmentGroupsForProcess(client, PROBLEM_PROCESS_NAME, PROBLEM_MEMBER_ROLE);
}
