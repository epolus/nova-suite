/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { buildIncidentListFilters } from '../incidents/list';

export const WORKBENCH_BUCKETS = ['mine', 'unassigned', 'sla', 'major'] as const;
export type WorkbenchBucket = (typeof WORKBENCH_BUCKETS)[number];

export type WorkbenchQueueItem = {
  kind: 'incident' | 'major_incident';
  id: string;
  number: string;
  title: string;
  priority: number | null;
  status: string;
  sla_due_at: string | null;
  sla_breached: boolean;
  vip: boolean;
  assignment_group_name: string | null;
  updated_at: string;
};

export type WorkbenchResolvedRecord = {
  kind: 'incident' | 'problem' | 'change' | 'major_incident';
  id: string;
  number: string;
};

const NUMBER_RE = /^(INC|PRB|CHG|MI)\d{1,12}$/;

const INCIDENT_FROM = `
  FROM incidents i
  LEFT JOIN users a ON a.id = i.assigned_to
  LEFT JOIN users c ON c.id = i.caller_id
  LEFT JOIN assignment_groups ag ON ag.id = i.assignment_group_id
  LEFT JOIN services svc ON svc.id = i.service_id
`;

export function normalizeWorkbenchNumbers(raw: string | undefined, cap = 12): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const number = part.trim().toUpperCase();
    if (!NUMBER_RE.test(number) || seen.has(number)) continue;
    seen.add(number);
    out.push(number);
    if (out.length >= cap) break;
  }
  return out;
}

function withExtra(whereClause: string, extra: string | null): string {
  if (!extra) return whereClause;
  if (!whereClause) return `WHERE ${extra}`;
  return `${whereClause} AND ${extra}`;
}

function asIso(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapQueueRow(row: Record<string, unknown>): WorkbenchQueueItem {
  return {
    kind: row.kind === 'major_incident' ? 'major_incident' : 'incident',
    id: String(row.id),
    number: String(row.number),
    title: String(row.title ?? ''),
    priority: row.priority == null || row.priority === '' ? null : Number(row.priority),
    status: String(row.status ?? ''),
    sla_due_at: asIso(row.sla_due_at),
    sla_breached: row.sla_breached === true,
    vip: row.vip === true,
    assignment_group_name: row.assignment_group_name == null ? null : String(row.assignment_group_name),
    updated_at: asIso(row.updated_at) ?? '',
  };
}

export function incidentQueueQuery(
  bucket: Exclude<WorkbenchBucket, 'major'>,
  search: string,
): Record<string, unknown> {
  const query: Record<string, unknown> = {
    status_not_in: 'resolved,closed,cancelled',
  };
  if (search) query.search = search;
  if (bucket === 'mine') query.assigned_to_me = 'true';
  if (bucket === 'unassigned') {
    query.unassigned = 'true';
    query.my_groups = 'true';
  }
  return query;
}

export async function listWorkbenchQueue(
  client: PoolClient,
  args: {
    bucket: WorkbenchBucket;
    search: string;
    limit: number;
    user: { id: string };
    isFulfiller: boolean;
  },
): Promise<WorkbenchQueueItem[]> {
  if (args.bucket === 'major') {
    const params: unknown[] = [];
    let searchSql = '';
    if (args.search) {
      params.push(`%${args.search}%`);
      searchSql = `AND (mi.number ILIKE $1 OR mi.title ILIKE $1 OR COALESCE(mi.description, '') ILIKE $1)`;
    }
    params.push(args.limit);
    const result = await client.query(
      `SELECT mi.id,
              mi.number,
              mi.title,
              mi.priority,
              mi.status::text AS status,
              NULL::timestamptz AS sla_due_at,
              false AS sla_breached,
              false AS vip,
              ag.name AS assignment_group_name,
              mi.updated_at,
              'major_incident'::text AS kind
         FROM major_incidents mi
         LEFT JOIN assignment_groups ag ON ag.id = mi.assigned_team_id
        WHERE mi.status::text NOT IN ('resolved', 'cancelled')
          ${searchSql}
        ORDER BY mi.updated_at DESC
        LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((row) => mapQueueRow(row as Record<string, unknown>));
  }

  const filters = buildIncidentListFilters(
    incidentQueueQuery(args.bucket, args.search),
    args.user,
    { isFulfiller: args.isFulfiller, sort: 'list' },
  );
  const params = [...filters.params, args.limit];
  const slaExtra = args.bucket === 'sla'
    ? `(i.sla_breached = true OR (i.sla_due_at IS NOT NULL AND i.sla_due_at <= now() + interval '30 minutes'))`
    : null;
  const where = withExtra(filters.whereClause, slaExtra);
  const result = await client.query(
    `SELECT i.id,
            i.number,
            i.title,
            i.priority,
            i.status::text AS status,
            i.sla_due_at,
            i.sla_breached,
            COALESCE(c.vip, false) AS vip,
            ag.name AS assignment_group_name,
            i.updated_at,
            'incident'::text AS kind
       ${INCIDENT_FROM}
       ${where}
      ORDER BY i.sla_due_at ASC NULLS LAST, i.updated_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return result.rows.map((row) => mapQueueRow(row as Record<string, unknown>));
}

export async function resolveWorkbenchRecords(
  client: PoolClient,
  rawNumbers: string | undefined,
): Promise<WorkbenchResolvedRecord[]> {
  const numbers = normalizeWorkbenchNumbers(rawNumbers);
  if (numbers.length === 0) return [];
  const result = await client.query(
    `SELECT id::text AS id, number, kind
       FROM (
         SELECT id, number, 'incident'::text AS kind FROM incidents WHERE number = ANY($1::text[])
         UNION ALL
         SELECT id, number, 'problem'::text AS kind FROM problems WHERE number = ANY($1::text[])
         UNION ALL
         SELECT id, number, 'change'::text AS kind FROM changes WHERE number = ANY($1::text[])
         UNION ALL
         SELECT id, number, 'major_incident'::text AS kind FROM major_incidents WHERE number = ANY($1::text[])
       ) found`,
    [numbers],
  );
  const byNumber = new Map(result.rows.map((row) => [String(row.number), row]));
  const records: WorkbenchResolvedRecord[] = [];
  for (const number of numbers) {
    const row = byNumber.get(number);
    if (!row) continue;
    const kind = String(row.kind);
    if (kind !== 'incident' && kind !== 'problem' && kind !== 'change' && kind !== 'major_incident') continue;
    records.push({ kind, id: String(row.id), number });
  }
  return records;
}
