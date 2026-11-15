/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Change list / nav / stats / calendar services ───
// Plain-argument services (PoolClient + args). No Request/Response.
import type { PoolClient } from 'pg';
import type { ChangeListUser } from './types';

/** Per-column "starts with" filters (cf.column=value) for list/nav queries. */
export const CHANGE_CF_MAP: Record<string, string> = {
  number: 'c.number',
  title: 'c.title',
  status: 'c.status::text',
  stage: 'c.stage::text',
  risk_level: 'c.risk_level::text',
  priority: 'c.priority::text',
  change_type_name: 'ct.name',
  assignment_group_name: 'ag.name',
  assigned_to_name: 'u.display_name',
  requested_by_name: 'r.display_name',
  scheduled_start: 'c.scheduled_start::text',
  updated_at: 'c.updated_at::text',
};

export const CHANGE_LIST_FROM = `FROM changes c
         JOIN change_types ct ON ct.id = c.change_type_id
         LEFT JOIN assignment_groups ag ON ag.id = c.assignment_group_id
         LEFT JOIN users u ON u.id = c.assigned_to
         LEFT JOIN users r ON r.id = c.requested_by`;

const CHANGE_SORT_COLS: Record<string, string> = {
  number: 'c.number',
  title: 'c.title',
  status: 'c.status',
  stage: 'c.stage',
  risk_level: 'c.risk_level',
  priority: 'c.priority',
  scheduled_start: 'c.scheduled_start',
  updated_at: 'c.updated_at',
  created_at: 'c.created_at',
};

export function appendChangeColumnFilters(
  query: Record<string, unknown>,
  conditions: string[],
  params: unknown[],
  idx: number,
): number {
  for (const [qKey, qVal] of Object.entries(query)) {
    if (typeof qKey === 'string' && qKey.startsWith('cf.') && typeof qVal === 'string' && qVal) {
      const col = CHANGE_CF_MAP[qKey.slice(3)];
      if (col) {
        conditions.push(`${col} ILIKE $${idx}`);
        params.push(`${qVal}%`);
        idx++;
      }
    }
  }
  return idx;
}

export interface ChangeListFilters {
  conditions: string[];
  params: unknown[];
  paramIdx: number;
  whereClause: string;
  orderClause: string;
}

/**
 * Shared WHERE / ORDER BY builder for the list and prev/next-nav queries.
 * The list endpoint additionally honours `assignment_group_id`; nav does not.
 */
export function buildChangeListFilters(
  query: Record<string, unknown>,
  user: ChangeListUser,
  opts: { hasChangeRole: boolean; includeAssignmentGroup: boolean },
): ChangeListFilters {
  const conditions: string[] = ['c.tenant_id = current_tenant_id()'];
  const params: unknown[] = [];
  let idx = 1;

  if (!opts.hasChangeRole) {
    conditions.push(`(c.requested_by = $${idx} OR c.assigned_to = $${idx})`);
    params.push(user.id);
    idx++;
  }
  if (query.status) { conditions.push(`c.status = $${idx++}::change_status_enum`); params.push(query.status); }
  if (query.stage) { conditions.push(`c.stage = $${idx++}::change_stage_enum`); params.push(query.stage); }
  if (query.risk_level) { conditions.push(`c.risk_level = $${idx++}::change_risk_enum`); params.push(query.risk_level); }
  if (query.change_type_id) { conditions.push(`c.change_type_id = $${idx++}`); params.push(query.change_type_id); }
  if (opts.includeAssignmentGroup && query.assignment_group_id) {
    conditions.push(`c.assignment_group_id = $${idx++}`);
    params.push(query.assignment_group_id);
  }
  if (query.search) {
    conditions.push(`(c.number ILIKE $${idx} OR c.title ILIKE $${idx} OR c.description ILIKE $${idx})`);
    params.push(`%${query.search}%`);
    idx++;
  }

  idx = appendChangeColumnFilters(query, conditions, params, idx);

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const sortCol = CHANGE_SORT_COLS[String(query.sort_by || '')];
  const sortDir = query.sort_dir === 'desc' ? 'DESC' : 'ASC';
  const orderClause = sortCol ? `ORDER BY ${sortCol} ${sortDir}` : 'ORDER BY c.updated_at DESC';

  return { conditions, params, paramIdx: idx, whereClause, orderClause };
}

// ─── GET /api/changes ───

export async function listChanges(
  client: PoolClient,
  query: Record<string, unknown>,
  user: ChangeListUser,
  opts: { hasChangeRole: boolean; page: number; limit: number },
): Promise<{
  changes: unknown[];
  pagination: { page: number; limit: number; total: number; pages: number };
}> {
  const { page, limit } = opts;
  const offset = (page - 1) * limit;
  const { params, paramIdx, whereClause, orderClause } = buildChangeListFilters(query, user, {
    hasChangeRole: opts.hasChangeRole,
    includeAssignmentGroup: true,
  });
  const idx = paramIdx;

  const count = await client.query(
    `SELECT count(*)
         ${CHANGE_LIST_FROM}
         ${whereClause}`,
    params,
  );
  const total = Number(count.rows[0]?.count || 0);
  params.push(limit, offset);
  const list = await client.query(
    `SELECT c.*,
                ct.name AS change_type_name,
                ag.name AS assignment_group_name,
                u.display_name AS assigned_to_name,
                r.display_name AS requested_by_name,
                COALESCE(conflicts.conflict_count, 0)::int AS conflict_count,
                COALESCE(approvals.pending_approvals, 0)::int AS pending_approvals
         FROM changes c
         JOIN change_types ct ON ct.id = c.change_type_id
         LEFT JOIN assignment_groups ag ON ag.id = c.assignment_group_id
         LEFT JOIN users u ON u.id = c.assigned_to
         LEFT JOIN users r ON r.id = c.requested_by
         LEFT JOIN (
           SELECT change_id, count(*) AS conflict_count
           FROM change_conflicts
           WHERE tenant_id = current_tenant_id()
           GROUP BY change_id
         ) conflicts ON conflicts.change_id = c.id
         LEFT JOIN (
           SELECT change_id, count(*) FILTER (WHERE status = 'pending') AS pending_approvals
           FROM change_approvals
           WHERE tenant_id = current_tenant_id()
           GROUP BY change_id
         ) approvals ON approvals.change_id = c.id
         ${whereClause}
         ${orderClause}
         LIMIT $${idx} OFFSET $${idx + 1}`,
    params,
  );
  return {
    changes: list.rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

// ─── GET /api/changes/stats ───

export async function getChangeStats(
  client: PoolClient,
): Promise<{ open_total: number; pending_approval: number }> {
  const r = await client.query(
    `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('closed','cancelled','rejected'))::int AS open_total,
         COUNT(*) FILTER (WHERE status = 'pending_approval')::int AS pending_approval
       FROM changes`,
  );
  const row = r.rows[0];
  return { open_total: row.open_total, pending_approval: row.pending_approval };
}

// ─── GET /api/changes/nav ───

export async function getChangeNav(
  client: PoolClient,
  query: Record<string, unknown>,
  user: ChangeListUser,
  opts: { hasChangeRole: boolean },
): Promise<{ prev_id: string | null; next_id: string | null }> {
  const currentId = String(query.current || '');
  if (!currentId) return { prev_id: null, next_id: null };

  const { params, whereClause, orderClause } = buildChangeListFilters(query, user, {
    hasChangeRole: opts.hasChangeRole,
    includeAssignmentGroup: false,
  });
  const rows = await client.query(
    `SELECT c.id
       ${CHANGE_LIST_FROM}
       ${whereClause}
       ${orderClause}`,
    params,
  );
  const ids: string[] = rows.rows.map((r: { id: string }) => r.id);
  const pos = ids.indexOf(currentId);
  return {
    prev_id: pos > 0 ? ids[pos - 1] : null,
    next_id: pos >= 0 && pos < ids.length - 1 ? ids[pos + 1] : null,
  };
}

// ─── GET /api/changes/calendar ───

export async function getChangeCalendar(
  client: PoolClient,
  range: { from: string | null; to: string | null },
): Promise<{ changes: unknown[]; blackouts: unknown[] }> {
  const { from, to } = range;
  const params: unknown[] = [];
  let where = `c.tenant_id = current_tenant_id()`;
  if (from) {
    params.push(from);
    where += ` AND c.scheduled_end >= $${params.length}::timestamptz`;
  }
  if (to) {
    params.push(to);
    where += ` AND c.scheduled_start <= $${params.length}::timestamptz`;
  }
  const rows = await client.query(
    `SELECT c.id, c.number, c.title, c.status, c.risk_level, c.category, c.scheduled_start, c.scheduled_end,
              ct.name AS change_type_name, ag.name AS assignment_group_name,
              COALESCE(conflicts.conflict_count, 0)::int AS conflict_count
       FROM changes c
       JOIN change_types ct ON ct.id = c.change_type_id
       LEFT JOIN assignment_groups ag ON ag.id = c.assignment_group_id
       LEFT JOIN (
         SELECT change_id, count(*) AS conflict_count
         FROM change_conflicts
         WHERE tenant_id = current_tenant_id()
         GROUP BY change_id
       ) conflicts ON conflicts.change_id = c.id
       WHERE ${where}
       ORDER BY c.scheduled_start NULLS LAST, c.updated_at DESC`,
    params,
  );
  const blackouts = await client.query(
    `SELECT *
       FROM change_blackouts
       WHERE tenant_id = current_tenant_id()
       ORDER BY start_date`,
  );
  return { changes: rows.rows, blackouts: blackouts.rows };
}
