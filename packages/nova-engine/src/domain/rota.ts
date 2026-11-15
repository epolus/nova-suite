/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { AppError } from '../middleware/errorHandler';

type SqlClient = {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
};

export type RotaShift = {
  id: string;
  assignment_group_id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assignment_group_name?: string;
  user_name?: string;
  created_by_name?: string;
};

const SHIFT_SELECT = `
  SELECT s.*,
         g.name AS assignment_group_name,
         u.display_name AS user_name,
         cb.display_name AS created_by_name
  FROM rota_shifts s
  JOIN assignment_groups g ON g.id = s.assignment_group_id
  JOIN users u ON u.id = s.user_id
  LEFT JOIN users cb ON cb.id = s.created_by
`;

export async function listRotaShifts(
  client: PoolClient,
  input: {
    from: string;
    to: string;
    assignmentGroupId?: string | null;
  },
): Promise<RotaShift[]> {
  const params: unknown[] = [input.from, input.to];
  let where = `s.tenant_id = current_tenant_id()
       AND s.starts_at < $2::timestamptz
       AND s.ends_at > $1::timestamptz`;
  if (input.assignmentGroupId) {
    params.push(input.assignmentGroupId);
    where += ` AND s.assignment_group_id = $${params.length}`;
  }
  const r = await client.query(
    `${SHIFT_SELECT}
     WHERE ${where}
     ORDER BY s.starts_at ASC`,
    params,
  );
  return r.rows as RotaShift[];
}

/** User covering `at` (default now) for the assignment group, if any. */
export async function getOnCallUserForGroup(
  client: SqlClient,
  assignmentGroupId: string,
  at: Date | string = new Date(),
): Promise<{ user_id: string; user_name: string; shift_id: string } | null> {
  const r = await client.query(
    `SELECT s.id AS shift_id, s.user_id, u.display_name AS user_name
     FROM rota_shifts s
     JOIN users u ON u.id = s.user_id
     WHERE s.tenant_id = current_tenant_id()
       AND s.assignment_group_id = $1
       AND s.starts_at <= $2::timestamptz
       AND s.ends_at > $2::timestamptz
     ORDER BY s.starts_at DESC
     LIMIT 1`,
    [assignmentGroupId, at instanceof Date ? at.toISOString() : at],
  );
  if (r.rowCount === 0) return null;
  return {
    shift_id: String(r.rows[0].shift_id),
    user_id: String(r.rows[0].user_id),
    user_name: String(r.rows[0].user_name),
  };
}

async function assertGroupAndUser(
  client: PoolClient,
  assignmentGroupId: string,
  userId: string,
): Promise<void> {
  const group = await client.query(
    `SELECT 1 FROM assignment_groups
     WHERE tenant_id = current_tenant_id() AND id = $1 AND is_active = true`,
    [assignmentGroupId],
  );
  if (group.rowCount === 0) throw new AppError(400, 'Assignment group not found or inactive');

  const user = await client.query(
    `SELECT 1 FROM users
     WHERE tenant_id = current_tenant_id() AND id = $1 AND is_active = true`,
    [userId],
  );
  if (user.rowCount === 0) throw new AppError(400, 'User not found or inactive');
}

export async function createRotaShift(
  client: PoolClient,
  input: {
    assignmentGroupId: string;
    userId: string;
    startsAt: string;
    endsAt: string;
    notes?: string | null;
    createdBy: string;
  },
): Promise<RotaShift> {
  if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) {
    throw new AppError(400, 'ends_at must be after starts_at');
  }
  await assertGroupAndUser(client, input.assignmentGroupId, input.userId);

  const inserted = await client.query(
    `INSERT INTO rota_shifts (
       tenant_id, assignment_group_id, user_id, starts_at, ends_at, notes, created_by
     ) VALUES (
       current_tenant_id(), $1, $2, $3::timestamptz, $4::timestamptz, $5, $6
     ) RETURNING id`,
    [
      input.assignmentGroupId,
      input.userId,
      input.startsAt,
      input.endsAt,
      input.notes?.trim() || null,
      input.createdBy,
    ],
  );
  const list = await client.query(
    `${SHIFT_SELECT} WHERE s.id = $1`,
    [inserted.rows[0].id],
  );
  return list.rows[0] as RotaShift;
}

export async function updateRotaShift(
  client: PoolClient,
  shiftId: string,
  input: {
    assignmentGroupId?: string;
    userId?: string;
    startsAt?: string;
    endsAt?: string;
    notes?: string | null;
  },
): Promise<RotaShift> {
  const existing = await client.query(
    `SELECT * FROM rota_shifts WHERE tenant_id = current_tenant_id() AND id = $1`,
    [shiftId],
  );
  if (existing.rowCount === 0) throw new AppError(404, 'Rota shift not found');
  const current = existing.rows[0];

  const assignmentGroupId = input.assignmentGroupId ?? String(current.assignment_group_id);
  const userId = input.userId ?? String(current.user_id);
  const startsAt = input.startsAt ?? String(current.starts_at);
  const endsAt = input.endsAt ?? String(current.ends_at);
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new AppError(400, 'ends_at must be after starts_at');
  }
  await assertGroupAndUser(client, assignmentGroupId, userId);

  await client.query(
    `UPDATE rota_shifts
     SET assignment_group_id = $1,
         user_id = $2,
         starts_at = $3::timestamptz,
         ends_at = $4::timestamptz,
         notes = $5
     WHERE tenant_id = current_tenant_id()
       AND id = $6`,
    [
      assignmentGroupId,
      userId,
      startsAt,
      endsAt,
      input.notes !== undefined ? (input.notes?.trim() || null) : current.notes,
      shiftId,
    ],
  );
  const list = await client.query(`${SHIFT_SELECT} WHERE s.id = $1`, [shiftId]);
  return list.rows[0] as RotaShift;
}

export async function deleteRotaShift(client: PoolClient, shiftId: string): Promise<void> {
  const r = await client.query(
    `DELETE FROM rota_shifts
     WHERE tenant_id = current_tenant_id() AND id = $1
     RETURNING id`,
    [shiftId],
  );
  if (r.rowCount === 0) throw new AppError(404, 'Rota shift not found');
}
