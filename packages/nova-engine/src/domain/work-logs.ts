/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { AppError } from '../middleware/errorHandler';

export const WORK_LOG_ENTITY_TYPES = [
  'incident',
  'request_task',
  'problem_task',
  'change',
] as const;

export type WorkLogEntityType = (typeof WORK_LOG_ENTITY_TYPES)[number];

export type WorkLogRow = {
  id: string;
  entity_type: WorkLogEntityType;
  entity_id: string;
  user_id: string;
  user_name: string | null;
  minutes: number;
  worked_on: string;
  note: string | null;
  is_customer_visible: boolean;
  created_at: string;
  updated_at: string;
};

export function isWorkLogEntityType(value: string): value is WorkLogEntityType {
  return (WORK_LOG_ENTITY_TYPES as readonly string[]).includes(value);
}

const ENTITY_TABLE: Record<WorkLogEntityType, string> = {
  incident: 'incidents',
  request_task: 'request_tasks',
  problem_task: 'problem_tasks',
  change: 'changes',
};

export async function assertWorkLogEntityExists(
  client: PoolClient,
  entityType: WorkLogEntityType,
  entityId: string,
): Promise<void> {
  const table = ENTITY_TABLE[entityType];
  const r = await client.query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND tenant_id = current_tenant_id() LIMIT 1`,
    [entityId],
  );
  if (r.rowCount === 0) {
    throw new AppError(404, `${entityType} not found`);
  }
}

export async function listWorkLogs(
  client: PoolClient,
  entityType: WorkLogEntityType,
  entityId: string,
  opts?: { customerVisibleOnly?: boolean },
): Promise<WorkLogRow[]> {
  const r = await client.query(
    `SELECT
       w.id, w.entity_type, w.entity_id, w.user_id,
       COALESCE(u.display_name, u.email) AS user_name,
       w.minutes, w.worked_on::text AS worked_on, w.note,
       w.is_customer_visible, w.created_at, w.updated_at
     FROM work_logs w
     JOIN users u ON u.id = w.user_id
     WHERE w.entity_type = $1
       AND w.entity_id = $2
       AND ($3::boolean IS NOT TRUE OR w.is_customer_visible = true)
     ORDER BY w.worked_on DESC, w.created_at DESC`,
    [entityType, entityId, opts?.customerVisibleOnly === true],
  );
  return r.rows as WorkLogRow[];
}

export async function createWorkLog(
  client: PoolClient,
  input: {
    entityType: WorkLogEntityType;
    entityId: string;
    userId: string;
    minutes: number;
    workedOn: string;
    note: string | null;
    isCustomerVisible: boolean;
  },
): Promise<WorkLogRow> {
  await assertWorkLogEntityExists(client, input.entityType, input.entityId);
  const r = await client.query(
    `INSERT INTO work_logs (
       tenant_id, entity_type, entity_id, user_id,
       minutes, worked_on, note, is_customer_visible
     ) VALUES (
       current_tenant_id(), $1, $2, $3,
       $4, $5::date, $6, $7
     )
     RETURNING id`,
    [
      input.entityType,
      input.entityId,
      input.userId,
      input.minutes,
      input.workedOn,
      input.note,
      input.isCustomerVisible,
    ],
  );
  const rows = await listWorkLogs(client, input.entityType, input.entityId);
  const created = rows.find((row) => row.id === r.rows[0].id);
  if (!created) throw new AppError(500, 'Failed to load created work log');
  return created;
}

export async function updateWorkLog(
  client: PoolClient,
  id: string,
  patch: {
    minutes?: number;
    workedOn?: string;
    note?: string | null;
    isCustomerVisible?: boolean;
  },
): Promise<WorkLogRow> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.minutes !== undefined) {
    sets.push(`minutes = $${i++}`);
    vals.push(patch.minutes);
  }
  if (patch.workedOn !== undefined) {
    sets.push(`worked_on = $${i++}::date`);
    vals.push(patch.workedOn);
  }
  if (patch.note !== undefined) {
    sets.push(`note = $${i++}`);
    vals.push(patch.note);
  }
  if (patch.isCustomerVisible !== undefined) {
    sets.push(`is_customer_visible = $${i++}`);
    vals.push(patch.isCustomerVisible);
  }
  if (sets.length === 0) {
    throw new AppError(400, 'No fields to update');
  }
  vals.push(id);
  const updated = await client.query(
    `UPDATE work_logs SET ${sets.join(', ')}
     WHERE id = $${i} AND tenant_id = current_tenant_id()
     RETURNING entity_type, entity_id`,
    vals,
  );
  if (updated.rowCount === 0) throw new AppError(404, 'Work log not found');
  const entityType = updated.rows[0].entity_type as WorkLogEntityType;
  const entityId = updated.rows[0].entity_id as string;
  const rows = await listWorkLogs(client, entityType, entityId);
  const row = rows.find((r) => r.id === id);
  if (!row) throw new AppError(404, 'Work log not found');
  return row;
}

export async function deleteWorkLog(client: PoolClient, id: string): Promise<void> {
  const r = await client.query(
    `DELETE FROM work_logs WHERE id = $1 AND tenant_id = current_tenant_id() RETURNING id`,
    [id],
  );
  if (r.rowCount === 0) throw new AppError(404, 'Work log not found');
}

export function sumMinutes(rows: WorkLogRow[]): number {
  return rows.reduce((total, row) => total + (Number(row.minutes) || 0), 0);
}
