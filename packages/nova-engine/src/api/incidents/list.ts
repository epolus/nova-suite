/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Incident list / nav / lookup services ───
// Plain-argument services (PoolClient + args). No Request/Response.
import type { PoolClient } from 'pg';
import { appendPrefixColumnFilters, paginationMeta, sqlSortDirection } from '../../domain/list-query';
import { endUserIncidentVisibilityCondition } from './sla-helpers';

/** Per-column "starts with" filters (cf.column=value). */
export const INCIDENT_CF_MAP: Record<string, string> = {
  number: 'i.number', title: 'i.title', status: 'i.status::text',
  priority: 'i.priority::text', category: 'i.category',
  assigned_to_name: 'a.display_name', caller_name: 'c.display_name',
  assignment_group_name: 'ag.name', service_name: 'svc.name',
  impact: 'i.impact::text', urgency: 'i.urgency::text',
};

const ALLOWED_SORT_COLS: Record<string, string> = {
  number: 'i.number',
  title: 'i.title',
  priority: 'i.priority',
  status: 'i.status',
  assigned_to_name: 'a.display_name',
  assignment_group_name: 'ag.name',
  created_at: 'i.created_at',
  updated_at: 'i.updated_at',
  sla_due_at: 'i.sla_due_at',
  impact: 'i.impact',
  urgency: 'i.urgency',
  category: 'i.category',
};

export interface IncidentListFilterUser {
  id: string;
}

export interface IncidentListFilterOpts {
  /** Fulfillers (admin/fulfiller) see every incident; others only their own. */
  isFulfiller: boolean;
  /**
   * 'list' -> `ORDER BY col dir` (default `i.created_at DESC`)
   * 'nav'  -> `ORDER BY col dir NULLS LAST, i.id dir` (stable order for LAG/LEAD)
   */
  sort: 'list' | 'nav';
}

export interface IncidentListFilters {
  conditions: string[];
  params: unknown[];
  paramIdx: number;
  cfMap: Record<string, string>;
  whereClause: string;
  sortClause: string;
}

/**
 * Single source of truth for the incident list + prev/next navigation filter set.
 * Both GET /api/incidents and GET /api/incidents/nav build their WHERE clause here.
 */
export function buildIncidentListFilters(
  query: Record<string, unknown>,
  user: IncidentListFilterUser,
  opts: IncidentListFilterOpts,
): IncidentListFilters {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 0;

  // Non-fulfiller users can see their own incidents and incidents they submitted.
  if (!opts.isFulfiller) {
    paramIdx++;
    const userParamRef = `$${paramIdx}`;
    conditions.push(endUserIncidentVisibilityCondition(userParamRef));
    params.push(user.id);
  }

  // "My Todo" / "My Groups" filters auto-exclude closed statuses unless explicit status is set
  const isTodoFilter = query.assigned_to_me === 'true' || query.my_groups === 'true';

  if (query.status) {
    paramIdx++;
    conditions.push(`i.status = $${paramIdx}`);
    params.push(query.status);
  } else if (query.status_not_in) {
    const excluded = String(query.status_not_in)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (excluded.length > 0) {
      const placeholders = excluded.map(() => {
        paramIdx++;
        return `$${paramIdx}`;
      });
      conditions.push(`i.status NOT IN (${placeholders.join(', ')})`);
      params.push(...excluded);
    }
  } else if (query.status_ne) {
    paramIdx++;
    conditions.push(`i.status != $${paramIdx}`);
    params.push(query.status_ne);
  } else if (isTodoFilter) {
    conditions.push(`i.status NOT IN ('resolved', 'closed', 'cancelled')`);
  }

  if (query.assigned_to_me === 'true') {
    paramIdx++;
    conditions.push(`i.assigned_to = $${paramIdx}`);
    params.push(user.id);
  } else if (query.assigned_to) {
    paramIdx++;
    conditions.push(`i.assigned_to = $${paramIdx}`);
    params.push(query.assigned_to);
  }

  if (query.my_groups === 'true') {
    paramIdx++;
    conditions.push(
      `i.assignment_group_id IN (SELECT group_id FROM assignment_group_members WHERE user_id = $${paramIdx})`,
    );
    params.push(user.id);
  }
  if (query.priority) {
    paramIdx++;
    conditions.push(`i.priority = $${paramIdx}`);
    params.push(parseInt(query.priority as string, 10));
  }
  if (query.sla_breached === 'true') {
    conditions.push('i.sla_breached = true');
  }
  if (query.search) {
    paramIdx++;
    conditions.push(`(i.number ILIKE $${paramIdx} OR i.title ILIKE $${paramIdx} OR i.description ILIKE $${paramIdx} OR i.category ILIKE $${paramIdx})`);
    params.push(`%${query.search}%`);
  }

  // Per-column "starts with" filters (cf.column=value)
  const cfMap = INCIDENT_CF_MAP;
  paramIdx = appendPrefixColumnFilters(query, cfMap, conditions, params, paramIdx + 1) - 1;

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sortCol = ALLOWED_SORT_COLS[query.sort_by as string];
  const sortDir = sqlSortDirection(query.sort_dir);
  let sortClause: string;
  if (opts.sort === 'nav') {
    sortClause = sortCol
      ? `ORDER BY ${sortCol} ${sortDir} NULLS LAST, i.id ${sortDir}`
      : 'ORDER BY i.created_at DESC NULLS LAST, i.id DESC';
  } else {
    sortClause = sortCol
      ? `ORDER BY ${sortCol} ${sortDir}`
      : 'ORDER BY i.created_at DESC';
  }

  return { conditions, params, paramIdx, cfMap, whereClause, sortClause };
}

export interface ListIncidentsResult {
  incidents: unknown[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export async function listIncidents(
  client: PoolClient,
  query: Record<string, unknown>,
  user: IncidentListFilterUser,
  opts: { isFulfiller: boolean; page: number; limit: number },
): Promise<ListIncidentsResult> {
  const { page, limit } = opts;
  const offset = (page - 1) * limit;

  const filters = buildIncidentListFilters(query, user, { isFulfiller: opts.isFulfiller, sort: 'list' });
  const { params, whereClause, sortClause } = filters;
  let { paramIdx } = filters;

  const countResult = await client.query(
    `SELECT count(*) FROM incidents i
         LEFT JOIN users a ON a.id = i.assigned_to
         LEFT JOIN users c ON c.id = i.caller_id
         LEFT JOIN assignment_groups ag ON ag.id = i.assignment_group_id
         LEFT JOIN services svc ON svc.id = i.service_id
         ${whereClause}`,
    params,
  );
  const total = parseInt(countResult.rows[0].count, 10);

  paramIdx++;
  params.push(limit);
  paramIdx++;
  params.push(offset);

  const result = await client.query(
    `SELECT i.*,
                a.display_name AS assigned_to_name,
                c.display_name AS caller_name,
                ag.name AS assignment_group_name,
                svc.name AS service_name
         FROM incidents i
         LEFT JOIN users a ON a.id = i.assigned_to
         LEFT JOIN users c ON c.id = i.caller_id
         LEFT JOIN assignment_groups ag ON ag.id = i.assignment_group_id
         LEFT JOIN services svc ON svc.id = i.service_id
         ${whereClause}
         ${sortClause}
         LIMIT $${paramIdx - 1} OFFSET $${paramIdx}`,
    params,
  );

  return {
    incidents: result.rows,
    pagination: paginationMeta(page, limit, total),
  };
}

export interface IncidentNavResult {
  prev_id: string | null;
  next_id: string | null;
  queryMs: number;
  filterCount: number;
}

export async function getIncidentNav(
  client: PoolClient,
  query: Record<string, unknown>,
  user: IncidentListFilterUser,
  opts: { isFulfiller: boolean; currentId: string },
): Promise<IncidentNavResult> {
  // Rebuild the same filter set from the list page
  const filters = buildIncidentListFilters(query, user, { isFulfiller: opts.isFulfiller, sort: 'nav' });
  const { conditions, params, whereClause, sortClause } = filters;
  let { paramIdx } = filters;

  paramIdx++;
  const currentIdParam = `$${paramIdx}`;
  params.push(opts.currentId);

  const queryStart = Date.now();
  const result = await client.query(
    `WITH filtered AS (
         SELECT i.id,
                LAG(i.id) OVER (${sortClause}) AS prev_id,
                LEAD(i.id) OVER (${sortClause}) AS next_id
         FROM incidents i
         LEFT JOIN users a ON a.id = i.assigned_to
         LEFT JOIN users c ON c.id = i.caller_id
         LEFT JOIN assignment_groups ag ON ag.id = i.assignment_group_id
         LEFT JOIN services svc ON svc.id = i.service_id
         ${whereClause}
       )
       SELECT prev_id, next_id FROM filtered WHERE id = ${currentIdParam}`,
    params,
  );
  const queryMs = Date.now() - queryStart;

  const row = result.rows[0];
  return {
    prev_id: row?.prev_id ?? null,
    next_id: row?.next_id ?? null,
    queryMs,
    filterCount: conditions.length,
  };
}

export interface IncidentStatsResult {
  open_total: number;
  sla_breached: number;
  assigned_to_me: number;
  by_priority: Array<{ priority: number; label?: string; count: number }>;
}

export async function getIncidentStats(
  client: PoolClient,
  user: IncidentListFilterUser,
  opts: { isFulfiller: boolean },
): Promise<IncidentStatsResult> {
  if (!opts.isFulfiller) {
    // End users: just their own open incident count
    const r = await client.query(
      `SELECT COUNT(*) FILTER (WHERE status NOT IN ('closed','cancelled')) AS open_total
         FROM incidents WHERE caller_id = $1`,
      [user.id],
    );
    return { open_total: parseInt(r.rows[0].open_total, 10), sla_breached: 0, assigned_to_me: 0, by_priority: [] };
  }

  const r = await client.query(
    `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('closed','cancelled'))::int AS open_total,
         COUNT(*) FILTER (WHERE sla_breached = true AND status NOT IN ('closed','cancelled'))::int AS sla_breached,
         COUNT(*) FILTER (WHERE assigned_to = $1 AND status NOT IN ('resolved','closed','cancelled'))::int AS assigned_to_me,
         COUNT(*) FILTER (WHERE priority = 1 AND status NOT IN ('closed','cancelled'))::int AS p1,
         COUNT(*) FILTER (WHERE priority = 2 AND status NOT IN ('closed','cancelled'))::int AS p2,
         COUNT(*) FILTER (WHERE priority = 3 AND status NOT IN ('closed','cancelled'))::int AS p3,
         COUNT(*) FILTER (WHERE priority = 4 AND status NOT IN ('closed','cancelled'))::int AS p4,
         COUNT(*) FILTER (WHERE priority = 5 AND status NOT IN ('closed','cancelled'))::int AS p5
       FROM incidents`,
    [user.id],
  );
  const row = r.rows[0];
  return {
    open_total: row.open_total,
    sla_breached: row.sla_breached,
    assigned_to_me: row.assigned_to_me,
    by_priority: [
      { priority: 1, label: 'P1 Critical', count: row.p1 },
      { priority: 2, label: 'P2 High', count: row.p2 },
      { priority: 3, label: 'P3 Moderate', count: row.p3 },
      { priority: 4, label: 'P4 Low', count: row.p4 },
      { priority: 5, label: 'P5 Planning', count: row.p5 },
    ],
  };
}

export async function listServices(client: PoolClient): Promise<unknown[]> {
  const result = await client.query(
    `SELECT id, name, description FROM services WHERE is_active = true ORDER BY name`,
  );
  return result.rows;
}

export async function listCallers(client: PoolClient): Promise<unknown[]> {
  const result = await client.query(
    `SELECT u.id, u.email, u.display_name, u.user_id, u.phone, u.mobile, u.vip,
              COALESCE(
                array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL),
                ARRAY[]::text[]
              ) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.is_active = true
       GROUP BY u.id
       ORDER BY u.display_name`,
  );
  return result.rows;
}

export async function listAssignmentGroups(client: PoolClient): Promise<unknown[]> {
  const result = await client.query(
    `SELECT ag.id, ag.name, ag.description, ag.is_active
       FROM assignment_groups ag
       WHERE ag.is_active = true
       ORDER BY ag.name`,
  );
  return result.rows;
}

export async function listCategories(
  client: PoolClient,
  opts: { includeInactive: boolean },
): Promise<unknown[]> {
  const result = await client.query(
    `SELECT c.id, c.name, c.description, c.parent_id, p.name AS parent_name, c.is_active
       FROM incident_categories c
       LEFT JOIN incident_categories p ON p.id = c.parent_id
       WHERE c.tenant_id = current_tenant_id()
         AND ($1::boolean OR c.is_active = true)
       ORDER BY COALESCE(p.name, c.name), CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END, c.name`,
    [opts.includeInactive],
  );
  return result.rows;
}

export async function listResolutionCodes(
  client: PoolClient,
  opts: { includeInactive: boolean },
): Promise<unknown[]> {
  const result = await client.query(
    `SELECT id, code, label, is_active
       FROM incident_resolution_codes
       WHERE tenant_id = current_tenant_id()
         AND ($1::boolean OR is_active = true)
       ORDER BY code`,
    [opts.includeInactive],
  );
  return result.rows;
}
