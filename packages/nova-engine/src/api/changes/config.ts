/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Change configuration services ───
// Change types, standard templates, risk questions, blackouts, CAB meetings.
// Plain-argument services (PoolClient + args). No Request/Response.
//
// `update*` services return `null` when the body contains no updatable fields
// (routes translate that to `{ success: true }`) and throw NotFound when the
// target row does not exist.
import type { PoolClient } from 'pg';
import { NotFound } from '../../middleware/errorHandler';
import type { ChangeActor } from './types';

type Row = Record<string, unknown>;

// ─── Change types ───

export async function listChangeTypes(client: PoolClient): Promise<Row[]> {
  const rows = await client.query(
    `SELECT *
       FROM change_types
       WHERE tenant_id = current_tenant_id()
       ORDER BY name`,
  );
  return rows.rows;
}

export async function createChangeType(client: PoolClient, body: Row): Promise<Row> {
  const b = body || {};
  const created = await client.query(
    `INSERT INTO change_types
       (tenant_id, name, description, requires_cab_approval, requires_manager_approval, auto_approve,
        default_risk_level, max_implementation_hours, approval_config, is_active)
       VALUES (current_tenant_id(), $1, $2, COALESCE($3, true), COALESCE($4, true), COALESCE($5, false),
               COALESCE($6::change_risk_enum, 'medium'::change_risk_enum), $7, COALESCE($8, '{"required_approvals":1}'::jsonb), COALESCE($9, true))
       RETURNING *`,
    [
      b.name,
      b.description || null,
      b.requires_cab_approval,
      b.requires_manager_approval,
      b.auto_approve,
      b.default_risk_level || null,
      b.max_implementation_hours || null,
      b.approval_config || null,
      b.is_active,
    ],
  );
  return created.rows[0];
}

export async function updateChangeType(
  client: PoolClient,
  id: string,
  body: Row,
): Promise<Row | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(body || {})) {
    if (k === 'default_risk_level') {
      sets.push(`${k} = $${i++}::change_risk_enum`);
    } else {
      sets.push(`${k} = $${i++}`);
    }
    vals.push(v);
  }
  if (sets.length === 0) return null;
  vals.push(id);
  const updated = await client.query(
    `UPDATE change_types
       SET ${sets.join(', ')}
       WHERE tenant_id = current_tenant_id()
         AND id = $${i}
       RETURNING *`,
    vals,
  );
  if (updated.rows.length === 0) throw NotFound('Change type not found');
  return updated.rows[0];
}

// ─── Standard change templates ───

export async function listStandardTemplates(client: PoolClient): Promise<Row[]> {
  const rows = await client.query(
    `SELECT sc.*, ct.name AS change_type_name
       FROM standard_changes sc
       JOIN change_types ct ON ct.id = sc.change_type_id
       WHERE sc.tenant_id = current_tenant_id()
       ORDER BY sc.name`,
  );
  return rows.rows;
}

export async function createStandardTemplate(client: PoolClient, body: Row): Promise<Row> {
  const b = body || {};
  const created = await client.query(
    `INSERT INTO standard_changes
       (tenant_id, change_type_id, name, description, category, implementation_plan_template, backout_plan_template, test_plan_template,
        pre_assessed_risk, automated, automation_script, usage_count, success_rate, is_active)
       VALUES (current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, COALESCE($8::change_risk_enum, 'low'::change_risk_enum), COALESCE($9, false), $10, COALESCE($11, 0), $12, COALESCE($13, true))
       RETURNING *`,
    [
      b.change_type_id,
      b.name,
      b.description || null,
      b.category || null,
      b.implementation_plan_template || null,
      b.backout_plan_template || null,
      b.test_plan_template || null,
      b.pre_assessed_risk || null,
      b.automated,
      b.automation_script || null,
      b.usage_count,
      b.success_rate ?? null,
      b.is_active,
    ],
  );
  return created.rows[0];
}

export async function updateStandardTemplate(
  client: PoolClient,
  id: string,
  body: Row,
): Promise<Row | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(body || {})) {
    if (k === 'pre_assessed_risk') {
      sets.push(`${k} = $${i++}::change_risk_enum`);
    } else {
      sets.push(`${k} = $${i++}`);
    }
    vals.push(v);
  }
  if (sets.length === 0) return null;
  vals.push(id);
  const updated = await client.query(
    `UPDATE standard_changes
       SET ${sets.join(', ')}
       WHERE tenant_id = current_tenant_id()
         AND id = $${i}
       RETURNING *`,
    vals,
  );
  if (updated.rows.length === 0) throw NotFound('Template not found');
  return updated.rows[0];
}

// ─── CAB meetings ───

export async function listCabMeetings(client: PoolClient): Promise<Row[]> {
  const rows = await client.query(
    `SELECT m.*, u.display_name AS created_by_name
       FROM cab_meetings m
       LEFT JOIN users u ON u.id = m.created_by
       WHERE m.tenant_id = current_tenant_id()
       ORDER BY m.scheduled_at DESC`,
  );
  return rows.rows;
}

export async function createCabMeeting(
  client: PoolClient,
  actor: ChangeActor,
  body: Row,
): Promise<Row> {
  const b = body || {};
  const created = await client.query(
    `INSERT INTO cab_meetings
       (tenant_id, title, scheduled_at, duration_min, minutes, created_by)
       VALUES (current_tenant_id(), $1, $2, $3, $4, $5)
       RETURNING *`,
    [b.title, b.scheduled_at, b.duration_min || 60, b.minutes || null, actor.id],
  );
  return created.rows[0];
}

export async function addChangeToCabMeeting(
  client: PoolClient,
  meetingId: string,
  changeId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO cab_meeting_changes (tenant_id, cab_meeting_id, change_id)
       VALUES (current_tenant_id(), $1, $2)
       ON CONFLICT (tenant_id, cab_meeting_id, change_id) DO NOTHING`,
    [meetingId, changeId],
  );
}

export async function recordCabDecision(
  client: PoolClient,
  meetingId: string,
  changeId: string,
  decision: string,
  notes: string | null,
): Promise<void> {
  await client.query(
    `UPDATE cab_meeting_changes
       SET decision = $1, notes = $2
       WHERE tenant_id = current_tenant_id()
         AND cab_meeting_id = $3
         AND change_id = $4`,
    [decision, notes, meetingId, changeId],
  );
}

// ─── Blackouts ───

export async function listBlackouts(client: PoolClient): Promise<Row[]> {
  const rows = await client.query(
    `SELECT *
       FROM change_blackouts
       WHERE tenant_id = current_tenant_id()
       ORDER BY start_date DESC`,
  );
  return rows.rows;
}

export async function createBlackout(client: PoolClient, body: Row): Promise<Row> {
  const b = body || {};
  const created = await client.query(
    `INSERT INTO change_blackouts (tenant_id, name, start_date, end_date, reason)
       VALUES (current_tenant_id(), $1, $2, $3, $4)
       RETURNING *`,
    [b.name, b.start_date, b.end_date, b.reason || null],
  );
  return created.rows[0];
}

export async function updateBlackout(
  client: PoolClient,
  id: string,
  body: Row,
): Promise<Row | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(body || {})) {
    sets.push(`${k} = $${i++}`);
    vals.push(v);
  }
  if (sets.length === 0) return null;
  vals.push(id);
  const updated = await client.query(
    `UPDATE change_blackouts
       SET ${sets.join(', ')}
       WHERE tenant_id = current_tenant_id()
         AND id = $${i}
       RETURNING *`,
    vals,
  );
  if (updated.rows.length === 0) throw NotFound('Blackout not found');
  return updated.rows[0];
}

// ─── Risk questions ───

export async function listRiskQuestions(
  client: PoolClient,
  includeInactive: boolean,
): Promise<Row[]> {
  const rows = await client.query(
    `SELECT *
       FROM change_risk_questions
       WHERE tenant_id = current_tenant_id()
         AND ($1::boolean OR is_active = true)
       ORDER BY sort_order ASC, created_at ASC`,
    [includeInactive],
  );
  return rows.rows;
}

export async function createRiskQuestion(client: PoolClient, body: Row): Promise<Row> {
  const b = body || {};
  const created = await client.query(
    `INSERT INTO change_risk_questions (tenant_id, prompt, weight, sort_order, is_active)
       VALUES (current_tenant_id(), $1, COALESCE($2, 1), COALESCE($3, 0), COALESCE($4, true))
       RETURNING *`,
    [b.prompt, b.weight, b.sort_order, b.is_active],
  );
  return created.rows[0];
}

const RISK_QUESTION_UPDATABLE = new Set(['prompt', 'weight', 'sort_order', 'is_active']);

export async function updateRiskQuestion(
  client: PoolClient,
  id: string,
  body: Row,
): Promise<Row | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(body || {})) {
    if (!RISK_QUESTION_UPDATABLE.has(k)) continue;
    sets.push(`${k} = $${i++}`);
    vals.push(v);
  }
  if (sets.length === 0) return null;
  vals.push(id);
  const updated = await client.query(
    `UPDATE change_risk_questions
       SET ${sets.join(', ')}
       WHERE tenant_id = current_tenant_id()
         AND id = $${i}
       RETURNING *`,
    vals,
  );
  if (updated.rows.length === 0) throw NotFound('Risk question not found');
  return updated.rows[0];
}

/** Soft-delete: deactivate so historical answers remain valid. */
export async function deactivateRiskQuestion(client: PoolClient, id: string): Promise<Row> {
  const updated = await client.query(
    `UPDATE change_risk_questions
       SET is_active = false
       WHERE tenant_id = current_tenant_id()
         AND id = $1
       RETURNING *`,
    [id],
  );
  if (updated.rows.length === 0) throw NotFound('Risk question not found');
  return updated.rows[0];
}
