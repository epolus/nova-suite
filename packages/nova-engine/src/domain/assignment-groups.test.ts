/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import {
  assignmentGroupServesProcess,
  isUserMemberOfAssignmentGroup,
  listAssignmentGroupsForProcess,
} from './assignment-groups';

function clientWithRows(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { client: { query } as unknown as PoolClient, query };
}

describe('assignmentGroupServesProcess', () => {
  it('passes process, role and requireActiveGroup flag', async () => {
    const { client, query } = clientWithRows([{ '?column?': 1 }]);
    await expect(
      assignmentGroupServesProcess(client, 'g1', 'Change Management', 'change_manager', {
        requireActiveGroup: true,
      }),
    ).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ag.id = $1'), [
      'g1',
      'Change Management',
      'change_manager',
      true,
    ]);
    expect(query.mock.calls[0][0]).toContain('$4::boolean IS NOT TRUE OR ag.is_active = true');
  });

  it('defaults requireActiveGroup to false (change/problem enablement)', async () => {
    const { client, query } = clientWithRows([]);
    await expect(
      assignmentGroupServesProcess(client, 'g1', 'Problem Management', 'problem'),
    ).resolves.toBe(false);
    expect(query.mock.calls[0][1][3]).toBe(false);
  });
});

describe('listAssignmentGroupsForProcess', () => {
  it('returns active groups for the process/role pair', async () => {
    const rows = [{ id: 'g1', name: 'CAB', description: null, is_active: true }];
    const { client, query } = clientWithRows(rows);
    await expect(listAssignmentGroupsForProcess(client, 'Change Management', 'change_manager')).resolves.toEqual(rows);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ag.is_active = true'), [
      'Change Management',
      'change_manager',
    ]);
  });
});

describe('isUserMemberOfAssignmentGroup', () => {
  it('is true when a membership row exists', async () => {
    const { client, query } = clientWithRows([{ '?column?': 1 }]);
    await expect(isUserMemberOfAssignmentGroup(client, 'g1', 'u1')).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('assignment_group_members'), ['g1', 'u1']);
  });

  it('is false when no row exists', async () => {
    const { client } = clientWithRows([]);
    await expect(isUserMemberOfAssignmentGroup(client, 'g1', 'u1')).resolves.toBe(false);
  });
});
